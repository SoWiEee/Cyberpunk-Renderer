#pragma once
#include "../GBuffer.h"
#include "PostProcessor.h"
#include "../Shader.h"
#include "../Camera.h"
#include "SSAO.h"

class DeferredRenderer {
public:
    GBuffer* gBuffer;
    PostProcessor* postProcessor;

    Shader* gBufferShader;
    Shader* lightingShader;
    Shader* lightBoxShader;

    SSAO* ssao;

    int width, height;
    unsigned int buildingNormalMap;

    DeferredRenderer(int w, int h);
    ~DeferredRenderer();

    // 流程控制 API
    void BeginGeometryPass(Camera& camera);
    void EndGeometryPass();

    void BeginLightingPass(Camera& camera); // 會自動切換到 HDR FBO
    void EndLightingPass(); // 畫 Quad，結束光照計算

    void BeginForwardPass(Camera& camera); // 複製深度，準備畫燈泡
    void EndForwardPass();

    void RenderPostProcess(); // Bloom + Tone Mapping
    unsigned int loadTexture(char const* path);
};