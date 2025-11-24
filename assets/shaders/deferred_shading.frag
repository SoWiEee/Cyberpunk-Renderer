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
    
    // read SSAO (0.0 ~ 1.0)
    float AmbientOcclusion = texture(ssao, TexCoords).r;

    // Skybox Fix
    if (length(Normal) < 0.1) {
        discard;
    }

    // apply SSAO
    vec3 ambient = vec3(0.1 * Diffuse * AmbientOcclusion);
    vec3 lighting = ambient; 
    
    vec3 viewDir  = normalize(viewPos - FragPos);

    for(int i = 0; i < NR_LIGHTS; ++i)
    {
        float distance = length(lights[i].Position - FragPos);
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

    // --- ÁÉ³ÕÃe§JÃú®ð ---
    float dist = length(viewPos - FragPos);
    float fogDist = 1.0 - exp(-dist * 0.015);
    float fogHeight = 1.0 - smoothstep(0.0, 6.0, FragPos.y);
    
    float fogFactor = max(fogDist, fogHeight * 0.8);
    fogFactor = clamp(fogFactor, 0.0, 1.0);

    vec3 fogColorHigh = vec3(0.05, 0.05, 0.1);
    vec3 fogColorLow = vec3(0.2, 0.05, 0.15);
    
    vec3 finalFogColor = mix(fogColorHigh, fogColorLow, fogHeight);

    // apply fog
    vec3 finalColor = mix(lighting, finalFogColor, fogFactor);

    FragColor = vec4(finalColor, 1.0);

    // Bloom
    float brightness = dot(lighting, vec3(0.2126, 0.7152, 0.0722));
    float threshold = 1.4;
    if(brightness > threshold)
        BrightColor = vec4(finalColor, 1.0);
    else
        BrightColor = vec4(0.0, 0.0, 0.0, 1.0);
}