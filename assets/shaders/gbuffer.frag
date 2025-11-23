#version 450 core

layout (location = 0) out vec3 gPosition;
layout (location = 1) out vec3 gNormal;
layout (location = 2) out vec4 gAlbedoSpec;
layout (location = 3) out vec3 gEmission;

in vec3 FragPos;
in vec3 Normal;
in vec2 TexCoords;

uniform vec3 objectColor; 

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

void main()
{    
    gPosition = FragPos;
    gNormal = normalize(Normal);
    
    // 基礎顏色：深灰色建築
    vec3 baseColor = vec3(0.05, 0.05, 0.07); 
    gAlbedoSpec.rgb = baseColor;
    gAlbedoSpec.a = 0.8;

    // Procedural Windows
    
    // 1. 根據法線決定投影平面 (Triplanar 概念)
    vec2 windowUV;
    if (abs(Normal.y) > 0.9) {
        // 屋頂：不做窗戶，做一些通風口的紋理
        windowUV = FragPos.xz;
    } else if (abs(Normal.x) > 0.9) {
        windowUV = FragPos.zy; // 側面
    } else {
        windowUV = FragPos.xy; // 正面
    }

    // 2. 網格化 (Tiling)
    // 數字越大，窗戶越密
    vec2 tilePos = windowUV * 2.0; 
    vec2 tileIndex = floor(tilePos); // 每一格的 ID
    vec2 tileUV = fract(tilePos);    // 格子內的 UV (0~1)

    // 3. 畫窗框 (Padding)
    // 如果 UV 靠近 0 或 1，就是窗框 (黑色)
    float padding = 0.15;
    float windowMask = step(padding, tileUV.x) * step(padding, tileUV.y) * step(tileUV.x, 1.0 - padding) * step(tileUV.y, 1.0 - padding);

    // 4. 隨機點亮
    float noise = random(tileIndex); // 根據格子 ID 產生隨機數
    vec3 emitColor = vec3(0.0);

    // 排除屋頂
    if (abs(Normal.y) < 0.9 && windowMask > 0.5) {
        if (noise > 0.7) {
            // 30% 機率點亮：冷藍色辦公室燈光
            emitColor = vec3(0.5, 0.8, 1.0) * 3.0; // 乘 3 讓它爆亮 (Bloom)
        } else if (noise > 0.65) {
            // 5% 機率點亮：暖橙色住家燈光
            emitColor = vec3(1.0, 0.6, 0.2) * 3.0;
        } else {
            gAlbedoSpec.rgb = vec3(0.1, 0.1, 0.15);
        }
    }

    gEmission = emitColor;
}