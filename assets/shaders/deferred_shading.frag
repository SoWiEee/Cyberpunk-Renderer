#version 450 core

layout (location = 0) out vec4 FragColor;      // 正常的畫面
layout (location = 1) out vec4 BrightColor;    // 只有亮部的畫面

in vec2 TexCoords;

// G-Buffer 貼圖
uniform sampler2D gPosition;
uniform sampler2D gNormal;
uniform sampler2D gAlbedoSpec;
uniform sampler2D ssao;

struct Light {
    vec3 Position;
    vec3 Color;
    float Linear;
    float Quadratic;
};

// 為了示範，我們先設定 32 顆燈
const int NR_LIGHTS = 32;
uniform Light lights[NR_LIGHTS];
uniform vec3 viewPos;

void main()
{             
    // 1. 從 G-Buffer 讀取資料
    vec3 FragPos = texture(gPosition, TexCoords).rgb;
    vec3 Normal = texture(gNormal, TexCoords).rgb;
    vec3 Diffuse = texture(gAlbedoSpec, TexCoords).rgb;
    float Specular = texture(gAlbedoSpec, TexCoords).a;
    float AmbientOcclusion = texture(ssao, TexCoords).r;
    
    // 簡單優化：如果這個像素沒有幾何體 (Position 為 0)，直接不計算
    // (這裡假設背景是黑的，或者根據深度圖判斷更準確)
    // if(length(Normal) < 0.1) discard; 

    // 2. 計算光照 (Blinn-Phong)
    vec3 ambient = vec3(0.1 * Diffuse * AmbientOcclusion); 
    vec3 lighting = ambient; 
    vec3 viewDir  = normalize(viewPos - FragPos);

    for(int i = 0; i < NR_LIGHTS; ++i)
    {
        // Diffuse
        vec3 lightDir = normalize(lights[i].Position - FragPos);
        vec3 diffuse = max(dot(Normal, lightDir), 0.0) * Diffuse * lights[i].Color;
        
        // Specular
        vec3 halfwayDir = normalize(lightDir + viewDir);  
        float spec = pow(max(dot(Normal, halfwayDir), 0.0), 16.0);
        vec3 specular = lights[i].Color * spec * Specular;
        
        // Attenuation (衰減)
        float distance = length(lights[i].Position - FragPos);
        float attenuation = 1.0 / (1.0 + lights[i].Linear * distance + lights[i].Quadratic * distance * distance);
        
        diffuse *= attenuation;
        specular *= attenuation;
        
        lighting += diffuse + specular;
    }

    FragColor = vec4(lighting, 1.0);

    // 2. 提取亮部 (Bloom Logic)
    // 計算亮度 (人眼對綠色最敏感)
    float brightness = dot(lighting, vec3(0.2126, 0.7152, 0.0722));
    
    // 閾值設為 1.0，超過就視為發光體
    if(brightness > 1.0)
        BrightColor = vec4(lighting, 1.0);
    else
        BrightColor = vec4(0.0, 0.0, 0.0, 1.0);
}