#version 450 core

layout (location = 0) out vec4 FragColor;
layout (location = 1) out vec4 BrightColor;

in vec2 TexCoords;

uniform sampler2D gPosition;
uniform sampler2D gNormal;
uniform sampler2D gAlbedoSpec;
uniform sampler2D ssao;
uniform sampler2D gEmission;

struct Light {
    vec3 Position;
    vec3 Color;
    float Linear;
    float Quadratic;
};

const int NR_LIGHTS = 100;
uniform Light lights[NR_LIGHTS];
uniform vec3 viewPos;

void main()
{
    vec3 FragPos = texture(gPosition, TexCoords).rgb;
    vec3 Normal = texture(gNormal, TexCoords).rgb;
    vec3 Diffuse = texture(gAlbedoSpec, TexCoords).rgb;
    float Specular = texture(gAlbedoSpec, TexCoords).a;
    vec3 Emission = texture(gEmission, TexCoords).rgb;

    // Ambient + Diffuse + Specular
    vec3 lighting = Diffuse * 0.1; // Ambient
    vec3 viewDir  = normalize(viewPos - FragPos);

    for(int i = 0; i < NR_LIGHTS; ++i)
    {
        float distance = length(lights[i].Position - FragPos);
        // 太遠的燈不計算
        if(distance > 15.0) continue; 

        vec3 lightDir = normalize(lights[i].Position - FragPos);
        vec3 diffuse = max(dot(Normal, lightDir), 0.0) * Diffuse * lights[i].Color;
        
        vec3 halfwayDir = normalize(lightDir + viewDir);  
        float spec = pow(max(dot(Normal, halfwayDir), 0.0), 16.0);
        vec3 specular = lights[i].Color * spec * Specular;
        
        float attenuation = 1.0 / (1.0 + lights[i].Linear * distance + lights[i].Quadratic * distance * distance);
        
        lighting += (diffuse + specular) * attenuation;
    }

    lighting += Emission;

    // 賽博龐克霧氣
    // 1. 越遠越霧
    float dist = length(viewPos - FragPos);
    float fogDist = 1.0 - exp(-dist * 0.015); // 調整 0.015 控制濃淡

    // 2. 越低越霧
    // 假設地面是 y=0，我們希望霧氣集中在 y=5 以下
    float fogHeight = 1.0 - smoothstep(0.0, 15.0, FragPos.y); 
    
    // 3. 混合兩者
    float fogFactor = max(fogDist, fogHeight * 0.8);
    fogFactor = clamp(fogFactor, 0.0, 1.0);

    // 4. 霧的顏色
    vec3 fogColorHigh = vec3(0.05, 0.05, 0.1); // 深藍夜空
    vec3 fogColorLow = vec3(0.2, 0.05, 0.15);  // 底部霓虹光暈
    
    vec3 finalFogColor = mix(fogColorHigh, fogColorLow, fogHeight);

    // apply fog
    vec3 finalColor = mix(lighting, finalFogColor, fogFactor);

    FragColor = vec4(finalColor, 1.0);

    // Bloom
    float brightness = dot(lighting, vec3(0.2126, 0.7152, 0.0722));
    float threshold = 1.4;
    if(brightness > threshold)
        BrightColor = vec4(lighting, 1.0);
    else
        BrightColor = vec4(0.0, 0.0, 0.0, 1.0);
}