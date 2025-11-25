#version 450 core

layout (location = 0) out vec4 FragColor;
layout (location = 1) out vec4 BrightColor;

in vec2 TexCoords;

uniform sampler2D gPosition;
uniform sampler2D gNormal;
uniform sampler2D gAlbedoSpec;
uniform sampler2D ssao;
uniform sampler2D gEmission;

uniform float uTime;

struct Light {
    vec3 Position;
    vec3 Color;
    float Linear;
    float Quadratic;
};

const int NR_LIGHTS = 100;
uniform Light lights[NR_LIGHTS];
uniform vec3 viewPos;

// --- 物理霧氣參數 ---
const int VOLUMETRIC_STEPS = 16;    // 步進次數 (越高越精細，但越慢)
const float MAX_FOG_DIST = 150.0;   // 霧氣計算的最遠距離
const float FOG_DENSITY = 0.03;     // 基礎濃度
const float NOISE_SCALE = 0.03;     // 噪聲縮放 (越小霧越綿密)
const float FOG_SPEED = 0.5;        // 流動速度

// --- 隨機噪聲函數 (用於生成雲霧形狀) ---
float hash(float n) { return fract(sin(n) * 753.5453123); }
float noise(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n = p.x + p.y * 157.0 + 113.0 * p.z;
    return mix(mix(mix(hash(n + 0.0), hash(n + 1.0), f.x),
                   mix(hash(n + 157.0), hash(n + 158.0), f.x), f.y),
               mix(mix(hash(n + 113.0), hash(n + 114.0), f.x),
                   mix(hash(n + 270.0), hash(n + 271.0), f.x), f.y), f.z);
}

// --- 分形布朗運動 (FBM) - 讓霧氣有層次感 ---
float fbm(vec3 p) {
    float f = 0.0;
    float m = 0.5;
    for (int i = 0; i < 3; i++) { // 疊加 3 層噪聲
        f += m * noise(p);
        p *= 2.0;
        m *= 0.5;
    }
    return f;
}

// --- Henyey-Greenstein 相位函數 (物理散射核心) ---
// g: 散射方向性 (-1: 後向散射, 1: 前向散射/逆光更亮)
float HenyeyGreenstein(float g, float cosTheta) {
    float g2 = g * g;
    return (1.0 - g2) / (4.0 * 3.14159 * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5));
}

// --- 獲取某一點的霧氣密度 ---
float GetFogDensity(vec3 pos) {
    // 1. 高度衰減 (越低越濃)
    float heightFactor = exp(-pos.y * 0.15); 
    
    // 2. 噪聲擾動 (加入時間讓它流動)
    vec3 wind = vec3(uTime * FOG_SPEED, 0.0, uTime * FOG_SPEED * 0.5);
    float fogNoise = fbm((pos + wind) * NOISE_SCALE);
    
    // 結合高度和噪聲，並限制在 0 以上
    return max((heightFactor * 2.0 + fogNoise) * FOG_DENSITY, 0.0);
}

void main()
{
    vec3 FragPos = texture(gPosition, TexCoords).rgb;
    vec3 Normal = texture(gNormal, TexCoords).rgb;
    vec3 Diffuse = texture(gAlbedoSpec, TexCoords).rgb;
    float Specular = texture(gAlbedoSpec, TexCoords).a;
    vec3 Emission = texture(gEmission, TexCoords).rgb;
    
    float AmbientOcclusion = texture(ssao, TexCoords).r;

    bool isGeometry = length(Normal) > 0.1;
    float fragDist = length(FragPos - viewPos);
    if (!isGeometry) fragDist = 1000.0;

    // --- 1. 基礎光照 (Surface Lighting) ---
    vec3 lighting = vec3(0.0);
    
    if (isGeometry) {
        // 半球環境光
        vec3 skyColor = vec3(0.02, 0.03, 0.08);
        vec3 groundColor = vec3(0.02, 0.02, 0.02);
        float hemiFactor = Normal.y * 0.5 + 0.5;
        vec3 ambient = mix(groundColor, skyColor, hemiFactor) * Diffuse * AmbientOcclusion * 2.0;
        lighting = ambient;
    }

    vec3 viewDir = normalize(FragPos - viewPos);

    // 點光源迴圈
    for(int i = 0; i < NR_LIGHTS; ++i) {
        if(isGeometry) {
            float distance = length(lights[i].Position - FragPos);
            if(distance < 15.0) {
                vec3 lightDir = normalize(lights[i].Position - FragPos);
                vec3 diffuse = max(dot(Normal, lightDir), 0.0) * Diffuse * lights[i].Color;
                vec3 halfwayDir = normalize(lightDir + viewDir);
                float spec = pow(max(dot(Normal, halfwayDir), 0.0), 16.0);
                vec3 specular = lights[i].Color * spec * Specular;
                float attenuation = 1.0 / (1.0 + lights[i].Linear * distance + lights[i].Quadratic * distance * distance);
                lighting += (diffuse + specular) * attenuation;
            }
        }
    }

    // 月光
    vec3 moonDir = normalize(vec3(0.5, 1.0, 0.3));
    vec3 moonColor = vec3(0.05, 0.05, 0.15);
    if (isGeometry) {
        float diff = max(dot(Normal, moonDir), 0.0);
        vec3 moonDiffuse = diff * moonColor * Diffuse;
        vec3 halfwayDir = normalize(moonDir + viewDir);
        float spec = pow(max(dot(Normal, halfwayDir), 0.0), 32.0);
        vec3 moonSpecular = moonColor * spec * Specular;
        lighting += moonDiffuse + moonSpecular;
        lighting += Emission;
    }

    // Raymarching Fog
    
    vec3 fogAccumulation = vec3(0.0); // 累積的霧顏色
    float transmittance = 1.0;        // 透射率 (1=完全透明, 0=完全不透明)
    
    // 我們不需要對每個像素都算到無限遠，只算到物體表面或最大霧距離
    float marchLimit = min(fragDist, MAX_FOG_DIST);
    float stepSize = marchLimit / float(VOLUMETRIC_STEPS);
    
    vec3 currentPos = viewPos;
    
    // 隨機抖動起始點 (Dither) - 消除層次感 (Banding)
    float dither = fract(sin(dot(TexCoords, vec2(12.9898, 78.233))) * 43758.5453);
    currentPos += viewDir * stepSize * dither;

    for(int i = 0; i < VOLUMETRIC_STEPS; ++i) 
    {
        // 1. 獲取當前點的霧密度 (包含噪聲和高度)
        float density = GetFogDensity(currentPos);
        
        if(density > 0.001) 
        {
            // 2. 計算此點的光照 (In-Scattering)
            // 我們這裡主要計算 "月光" 對霧的影響 (點光源太重了)
            // 使用 Henyey-Greenstein 相位函數模擬逆光效果
            float cosTheta = dot(viewDir, moonDir);
            float phase = HenyeyGreenstein(0.6, cosTheta); // 0.6 代表強烈的前向散射
            
            vec3 lightEnergy = moonColor * phase * 5.0; // 乘 5.0 增強霧氣亮度
            
            // 這裡也可以加上一點基礎環境光 (讓背光的霧不是全黑)
            lightEnergy += vec3(0.1, 0.02, 0.15) * 0.2; // 霓虹紫底色

            // 3. 累積顏色和阻光度
            // Beer-Lambert Law 近似
            float absorption = density * stepSize;
            vec3 absorbedLight = lightEnergy * absorption;
            
            fogAccumulation += absorbedLight * transmittance;
            transmittance *= exp(-absorption); // 霧越濃，透射率越低
        }
        
        if(transmittance < 0.01) break;

        currentPos += viewDir * stepSize;
    }

    // 混合：場景顏色 * 剩下的透射率 + 霧的累積顏色
    vec3 finalColor = lighting * transmittance + fogAccumulation;

    // 輸出
    FragColor = vec4(finalColor, 1.0);

    // Bloom Check
    float brightness = dot(finalColor, vec3(0.2126, 0.7152, 0.0722));
    float threshold = 2.0; 
    if(brightness > threshold)
        BrightColor = vec4(finalColor, 1.0);
    else
        BrightColor = vec4(0.0, 0.0, 0.0, 1.0);
}