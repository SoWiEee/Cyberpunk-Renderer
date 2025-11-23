#version 450 core

layout (location = 0) out vec4 FragColor;
layout (location = 1) out vec4 BrightColor;

in vec2 TexCoords;

// G-Buffer 貼圖
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

    FragColor = vec4(lighting, 1.0);

    // Bloom
    float brightness = dot(lighting, vec3(0.2126, 0.7152, 0.0722));
    float threshold = 1.4;
    if(brightness > threshold)
        BrightColor = vec4(lighting, 1.0);
    else
        BrightColor = vec4(0.0, 0.0, 0.0, 1.0);
}