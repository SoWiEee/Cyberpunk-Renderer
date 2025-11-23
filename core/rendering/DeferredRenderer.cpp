#include "DeferredRenderer.h"
#include <glm/gtc/type_ptr.hpp>

DeferredRenderer::DeferredRenderer(int w, int h) : width(w), height(h) {
    gBuffer = new GBuffer(w, h);
    postProcessor = new PostProcessor(w, h);
    ssao = new SSAO(w, h);

    gBufferShader = new Shader("assets/shaders/gbuffer.vert", "assets/shaders/gbuffer.frag");
    lightingShader = new Shader("assets/shaders/deferred_shading.vert", "assets/shaders/deferred_shading.frag");
    lightBoxShader = new Shader("assets/shaders/light_box.vert", "assets/shaders/light_box.frag");

    lightingShader->use();
    lightingShader->setInt("gPosition", 0);
    lightingShader->setInt("gNormal", 1);
    lightingShader->setInt("gAlbedoSpec", 2);
    lightingShader->setInt("ssao", 3);
}

DeferredRenderer::~DeferredRenderer() {
    delete gBuffer;
    delete postProcessor;
    delete gBufferShader;
    delete lightingShader;
    delete lightBoxShader;
    delete ssao;
}

void DeferredRenderer::BeginGeometryPass(Camera& camera) {
    glBindFramebuffer(GL_FRAMEBUFFER, gBuffer->gBuffer);
    glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

    gBufferShader->use();
    glm::mat4 projection = glm::perspective(glm::radians(camera.Zoom), (float)width / (float)height, 0.1f, 100.0f);
    glm::mat4 view = camera.GetViewMatrix();
    gBufferShader->setMat4("projection", glm::value_ptr(projection));
    gBufferShader->setMat4("view", glm::value_ptr(view));
}

void DeferredRenderer::EndGeometryPass() {
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
}

void DeferredRenderer::BeginLightingPass(Camera& camera) {
    // 1. 計算 SSAO
    glm::mat4 projection = glm::perspective(glm::radians(camera.Zoom), (float)width / (float)height, 0.1f, 100.0f);
    glm::mat4 view = camera.GetViewMatrix();

    ssao->Compute(gBuffer->gPosition, gBuffer->gNormal, projection, view);
    ssao->Blur();

    // 2. 開始原本的 Lighting Pass
    postProcessor->BeginRender(); // 綁定 HDR FBO

    lightingShader->use();
    glActiveTexture(GL_TEXTURE0); glBindTexture(GL_TEXTURE_2D, gBuffer->gPosition);
    glActiveTexture(GL_TEXTURE1); glBindTexture(GL_TEXTURE_2D, gBuffer->gNormal);
    glActiveTexture(GL_TEXTURE2); glBindTexture(GL_TEXTURE_2D, gBuffer->gAlbedoSpec);

    // ★ 綁定 SSAO 結果
    glActiveTexture(GL_TEXTURE3);
    glBindTexture(GL_TEXTURE_2D, ssao->GetSSAOTexture()); // 綁定模糊後的 SSAO

    lightingShader->setVec3("viewPos", camera.Position);
}

void DeferredRenderer::EndLightingPass() {
    Primitives::renderQuad();
    // 注意：不要在這裡解綁 FBO，因為我們還要接著畫 Forward Pass (燈泡)
}

void DeferredRenderer::BeginForwardPass(Camera& camera) {
    // 複製深度緩衝 (從 GBuffer -> HDR FBO)
    glBindFramebuffer(GL_READ_FRAMEBUFFER, gBuffer->gBuffer);
    glBindFramebuffer(GL_DRAW_FRAMEBUFFER, postProcessor->hdrFBO);
    glBlitFramebuffer(0, 0, width, height, 0, 0, width, height, GL_DEPTH_BUFFER_BIT, GL_NEAREST);

    // 切換回 HDR FBO 繼續畫
    glBindFramebuffer(GL_FRAMEBUFFER, postProcessor->hdrFBO);

    lightBoxShader->use();
    glm::mat4 projection = glm::perspective(glm::radians(camera.Zoom), (float)width / (float)height, 0.1f, 100.0f);
    glm::mat4 view = camera.GetViewMatrix();
    lightBoxShader->setMat4("projection", glm::value_ptr(projection));
    lightBoxShader->setMat4("view", glm::value_ptr(view));
}

void DeferredRenderer::EndForwardPass() {
    postProcessor->EndRender(); // 解綁 FBO
}

void DeferredRenderer::RenderPostProcess() {
    postProcessor->RenderBloom();
    postProcessor->RenderFinal(1.0f);
}