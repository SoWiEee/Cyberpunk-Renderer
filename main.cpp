#include <glad/glad.h>
#include <GLFW/glfw3.h>
#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/type_ptr.hpp>
#include <iostream>
#include <vector>

#include "core/Shader.h"
#include "core/Camera.h"
#include "core/GBuffer.h"
#include "core/rendering/DeferredRenderer.h"
#include "core/rendering/Primitives.h"
#include "core/rendering/InstancedMesh.h"

extern "C" {
    __declspec(dllexport) unsigned long NvOptimusEnablement = 0x00000001;
}

// --- 全域變數 ---
const unsigned int SCR_WIDTH = 1280;
const unsigned int SCR_HEIGHT = 720;

Camera camera(glm::vec3(0.0f, 5.0f, 15.0f));
float lastX = (float)SCR_WIDTH / 2.0;
float lastY = (float)SCR_HEIGHT / 2.0;
bool firstMouse = true;
float deltaTime = 0.0f;
float lastFrame = 0.0f;

// 光源設定
const unsigned int NR_LIGHTS = 50;
std::vector<glm::vec3> lightPositions;
std::vector<glm::vec3> lightColors;
InstancedMesh* cityMesh;

// Callback 宣告
void framebuffer_size_callback(GLFWwindow* window, int width, int height);
void mouse_callback(GLFWwindow* window, double xpos, double ypos);
void scroll_callback(GLFWwindow* window, double xoffset, double yoffset);
void processInput(GLFWwindow* window);

int main()
{
    // GLFW init
    glfwInit();
    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 4);
    glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 5);
    glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);

    GLFWwindow* window = glfwCreateWindow(SCR_WIDTH, SCR_HEIGHT, "Deferred Shading - GBuffer Debug", NULL, NULL);
    if (window == NULL) {
        std::cout << "Failed to create GLFW window" << std::endl;
        glfwTerminate();
        return -1;
    }
    glfwMakeContextCurrent(window);
    glfwSetFramebufferSizeCallback(window, framebuffer_size_callback);
    glfwSetCursorPosCallback(window, mouse_callback);
    glfwSetScrollCallback(window, scroll_callback);

	// hide cursor
    glfwSetInputMode(window, GLFW_CURSOR, GLFW_CURSOR_DISABLED);

    // GLAD init
    if (!gladLoadGLLoader((GLADloadproc)glfwGetProcAddress)) {
        std::cout << "Failed to initialize GLAD" << std::endl;
        return -1;
    }

    glEnable(GL_DEPTH_TEST);

	// Create Deferred Renderer
    DeferredRenderer renderer(SCR_WIDTH, SCR_HEIGHT);

    std::vector<glm::mat4> cityModels;
    int CITY_SIZE = 20; // 20x20 的街區
    float SPACING = 3.0f; // 建築間距

    srand(999);

    for (int x = -CITY_SIZE; x < CITY_SIZE; x++) {
        for (int z = -CITY_SIZE; z < CITY_SIZE; z++) {
            // 留出中間空地給相機
            if (abs(x) < 2 && abs(z) < 2) continue;

            glm::mat4 model = glm::mat4(1.0f);

            // 位置
            float posX = x * SPACING;
            float posZ = z * SPACING;

            // 高度隨機：大部分是矮樓，偶爾有摩天大樓
            float height = static_cast<float>(rand() % 5 + 1); // 1~6層
            if (rand() % 100 > 90) height *= 4.0f; // 10% 機率變超高
            if (rand() % 100 > 95) height *= 2.0f; // 5% 機率變巨高

            // 位移：Cube 原點在中心，往上移一半高度讓它貼地 (y=0)
            model = glm::translate(model, glm::vec3(posX, height / 2.0f, posZ));

            // 縮放：變成瘦長的長方體
            model = glm::scale(model, glm::vec3(2.0f, height, 2.0f));

            cityModels.push_back(model);
        }
    }

    cityMesh = new InstancedMesh(cityModels);
    lightPositions.clear();
    lightColors.clear();

    // ==========================================
    // 2. 生成賽博龐克光源
    // ==========================================
    lightPositions.clear();
    lightColors.clear();

    for (unsigned int i = 0; i < NR_LIGHTS; i++)
    {
        // 隨機顏色：青色(Cyan)、洋紅(Magenta)、紫色
        glm::vec3 color;
        int type = rand() % 3;
        if (type == 0) color = glm::vec3(0.0f, 1.0f, 1.0f); // Cyan
        else if (type == 1) color = glm::vec3(1.0f, 0.0f, 1.0f); // Magenta
        else color = glm::vec3(0.5f, 0.0f, 1.0f); // Purple

        lightColors.push_back(color * 10.0f);
        lightPositions.push_back(glm::vec3(0.0f));
    }

    // Render Loop
    while (!glfwWindowShouldClose(window))
    {
        float currentFrame = static_cast<float>(glfwGetTime());
        deltaTime = currentFrame - lastFrame;
        lastFrame = currentFrame;

        processInput(window);

        // 更新光源動畫 (在城市街道間穿梭)
        for (unsigned int i = 0; i < lightPositions.size(); i++)
        {
            float time = currentFrame * 0.3f;
            float offset = i * 10.0f;

            // 讓光在街道 (X 和 Z 軸) 上移動
            float x = sin(time + offset) * 40.0f;
            float z = cos(time * 0.5f + offset) * 40.0f;

            // 高度在 1~10 之間浮動
            float y = 2.0f + sin(time * 2.0f + i) * 2.0f + 2.0f;

            lightPositions[i] = glm::vec3(x, y, z);
        }

        // --- Phase 1: Geometry ---
        renderer.BeginGeometryPass(camera);
        renderer.gBufferShader->setVec3("objectColor", glm::vec3(0.1f, 0.1f, 0.1f)); // 黑色大樓
        cityMesh->Draw();
        renderer.EndGeometryPass();

        // --- Phase 2: Lighting ---
        renderer.BeginLightingPass(camera);

        for (unsigned int i = 0; i < lightPositions.size(); i++) {
            std::string iStr = std::to_string(i);
            renderer.lightingShader->setVec3("lights[" + iStr + "].Position", lightPositions[i]);
            renderer.lightingShader->setVec3("lights[" + iStr + "].Color", lightColors[i]);

            const float linear = 0.14f;
            const float quadratic = 0.07f;
            renderer.lightingShader->setFloat("lights[" + iStr + "].Linear", linear);
            renderer.lightingShader->setFloat("lights[" + iStr + "].Quadratic", quadratic);
        }
        renderer.EndLightingPass();

        // --- Phase 3: Forward (Lights) ---

        renderer.BeginForwardPass(camera);
        for (unsigned int i = 0; i < lightPositions.size(); i++) {
            glm::mat4 model = glm::mat4(1.0f);
            model = glm::translate(model, lightPositions[i]);
            model = glm::scale(model, glm::vec3(0.1f));

            renderer.lightBoxShader->setMat4("model", glm::value_ptr(model));
            renderer.lightBoxShader->setVec3("lightColor", lightColors[i]); // 讓燈泡亮一點

            Primitives::renderCube();
        }
        renderer.EndForwardPass();

        // --- Phase 4: Post Process ---
        renderer.RenderPostProcess();

        glfwSwapBuffers(window);
        glfwPollEvents();
    }

    glfwTerminate();
    return 0;
}

// --- Callbacks ---

void processInput(GLFWwindow* window) {
    if (glfwGetKey(window, GLFW_KEY_ESCAPE) == GLFW_PRESS) glfwSetWindowShouldClose(window, true);
    if (glfwGetKey(window, GLFW_KEY_W) == GLFW_PRESS) camera.ProcessKeyboard(FORWARD, deltaTime);
    if (glfwGetKey(window, GLFW_KEY_S) == GLFW_PRESS) camera.ProcessKeyboard(BACKWARD, deltaTime);
    if (glfwGetKey(window, GLFW_KEY_A) == GLFW_PRESS) camera.ProcessKeyboard(LEFT, deltaTime);
    if (glfwGetKey(window, GLFW_KEY_D) == GLFW_PRESS) camera.ProcessKeyboard(RIGHT, deltaTime);
}

void framebuffer_size_callback(GLFWwindow* window, int width, int height)
{
    glViewport(0, 0, width, height);
}

void mouse_callback(GLFWwindow* window, double xposIn, double yposIn)
{
    float xpos = static_cast<float>(xposIn);
    float ypos = static_cast<float>(yposIn);
    if (firstMouse)
    {
        lastX = xpos;
        lastY = ypos;
        firstMouse = false;
    }
    float xoffset = xpos - lastX;
    float yoffset = lastY - ypos;
    lastX = xpos;
    lastY = ypos;
    camera.ProcessMouseMovement(xoffset, yoffset);
}

void scroll_callback(GLFWwindow* window, double xoffset, double yoffset)
{
    camera.ProcessMouseScroll(static_cast<float>(yoffset));
}