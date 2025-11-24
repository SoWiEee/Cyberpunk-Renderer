#version 450 core

layout (location = 0) out vec4 gPosition; 
layout (location = 1) out vec3 gNormal;
layout (location = 2) out vec4 gAlbedoSpec;
layout (location = 3) out vec3 gEmission;

in vec3 FragPos;
in vec3 Normal;
in vec2 TexCoords;

uniform vec3 objectColor;
uniform sampler2D normalMap;

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

vec3 getTriplanarNormal(vec3 worldPos, vec3 worldNormal, float scale) {
    // 1. 計算混合權重
    // 根據法線朝向決定用哪個面的貼圖。越垂直於該軸，權重越大。
    vec3 blend = abs(worldNormal);
    // 稍微銳化權重，讓過渡區更緊密 (可選)
    blend = pow(blend, vec3(4.0)); 
    // 正規化權重，確保總和為 1
    blend /= (blend.x + blend.y + blend.z); 

    // 2. 計算三個投影面的 UV
    vec2 uvX = worldPos.zy * scale; // 從 X 軸看，平面是 ZY
    vec2 uvY = worldPos.xz * scale; // 從 Y 軸看，平面是 XZ
    vec2 uvZ = worldPos.xy * scale; // 從 Z 軸看，平面是 XY

    // 3. 讀取法線貼圖
    // 貼圖顏色是 [0, 1]，要轉換回切線空間向量 [-1, 1]
    vec3 tnormalX = texture(normalMap, uvX).rgb * 2.0 - 1.0;
    vec3 tnormalY = texture(normalMap, uvY).rgb * 2.0 - 1.0;
    vec3 tnormalZ = texture(normalMap, uvZ).rgb * 2.0 - 1.0;

    // 4. 將切線空間法線轉為世界空間
    // 這一步比較魔幻。因為我們沒有 TBN 矩陣，我們假設切線空間的 Z 軸 (貼圖藍色通道)
    // 永遠指向世界空間的 X, Y 或 Z 軸。
    // 我們需要根據原始法線的正負號來翻轉貼圖的軸向，確保凹凸方向正確。
    
    vec3 axisSign = sign(worldNormal);
    
    // 修正 X 投影面的法線方向
    tnormalX.z *= axisSign.x; 
    vec3 worldNormalX = vec3(tnormalX.z, tnormalX.y, tnormalX.x); // Swizzle: ZYX

    // 修正 Y 投影面的法線方向
    tnormalY.z *= axisSign.y;
    vec3 worldNormalY = vec3(tnormalY.x, tnormalY.z, tnormalY.y); // Swizzle: XZY

    // 修正 Z 投影面的法線方向
    tnormalZ.z *= axisSign.z;
    vec3 worldNormalZ = vec3(tnormalZ.x, tnormalZ.y, tnormalZ.z); // Swizzle: XYZ
    
    // 5. 混合三個方向的法線
    vec3 finalNormal = normalize(
        worldNormalX * blend.x + 
        worldNormalY * blend.y + 
        worldNormalZ * blend.z
    );

    return finalNormal;
}

void main()
{    
    gPosition = vec4(FragPos, 1.0);
    // 原始的幾何法線
    vec3 geometricNormal = normalize(Normal);
    vec3 detailedNormal = getTriplanarNormal(FragPos, geometricNormal, 1.0);
    gNormal = detailedNormal;
    
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