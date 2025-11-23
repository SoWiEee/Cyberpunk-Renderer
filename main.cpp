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
const unsigned int NR_LIGHTS = 32;
std::vector<glm::vec3> lightPositions;
std::vector<glm::vec3> lightColors;

// Callback 宣告
void framebuffer_size_callback(GLFWwindow* window, int width, int height);
void mouse_callback(GLFWwindow* window, double xpos, double ypos);
void scroll_callback(GLFWwindow* window, double xoffset, double yoffset);
void processInput(GLFWwindow* window);

struct LightInfo { glm::vec3 pos; glm::vec3 color; };
std::vector<LightInfo> lights;

int main()
{
    // 1. 初始化 GLFW
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

    // 隱藏滑鼠
    glfwSetInputMode(window, GLFW_CURSOR, GLFW_CURSOR_DISABLED);

    // 2. 初始化 GLAD
    if (!gladLoadGLLoader((GLADloadproc)glfwGetProcAddress)) {
        std::cout << "Failed to initialize GLAD" << std::endl;
        return -1;
    }

    glEnable(GL_DEPTH_TEST);

    // 1. 建立渲染器
    DeferredRenderer renderer(SCR_WIDTH, SCR_HEIGHT);

    // 2. 初始化光源 (邏輯保持不變)
    srand(13);
    for (unsigned int i = 0; i < NR_LIGHTS; i++)
    {
        float rColor = ((rand() % 100) / 200.0f) + 0.5f;
        float gColor = ((rand() % 100) / 200.0f) + 0.5f;
        float bColor = ((rand() % 100) / 200.0f) + 0.5f;
        lightColors.push_back(glm::vec3(rColor, gColor, bColor));
        lightPositions.push_back(glm::vec3(0.0f)); // 佔位
    }

    // Render Loop
    while (!glfwWindowShouldClose(window))
    {
        float currentFrame = static_cast<float>(glfwGetTime());
        deltaTime = currentFrame - lastFrame;
        lastFrame = currentFrame;

        processInput(window);

        // 更新光源動畫
        for (unsigned int i = 0; i < lightPositions.size(); i++)
        {
            float time = currentFrame * 0.5f;
            float offset = i * 2.0f * 3.14159f / NR_LIGHTS;
            float radius = 4.0f + sin(time + i) * 2.0f;
            lightPositions[i].x = sin(time + offset) * radius;
            lightPositions[i].z = cos(time + offset) * radius;
            lightPositions[i].y = sin(time * 2.0f + offset) * 1.0f;
        }

        // --- Phase 1: Geometry ---
        renderer.BeginGeometryPass(camera);
        for (int i = -3; i < 3; i++) {
            for (int j = -3; j < 3; j++) {
                // ★ 修正：必須在這裡計算 model 矩陣
                glm::mat4 model = glm::mat4(1.0f);
                model = glm::translate(model, glm::vec3(i * 2.5f, 0.0f, j * 2.5f));
                model = glm::rotate(model, glm::radians(currentFrame * 10.0f), glm::vec3(1.0f, 0.3f, 0.5f));

                // 使用 renderer 內部的 shader
                renderer.gBufferShader->setMat4("model", glm::value_ptr(model));
                renderer.gBufferShader->setVec3("objectColor", glm::vec3(0.8f, 0.4f, 0.2f));

                Primitives::renderCube();
            }
        }
        renderer.EndGeometryPass();

        // --- Phase 2: Lighting ---
        renderer.BeginLightingPass(camera);

        for (unsigned int i = 0; i < lightPositions.size(); i++) {
            std::string iStr = std::to_string(i);
            renderer.lightingShader->setVec3("lights[" + iStr + "].Position", lightPositions[i]);
            renderer.lightingShader->setVec3("lights[" + iStr + "].Color", lightColors[i]);

            const float linear = 0.35f;
            const float quadratic = 0.44f;
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