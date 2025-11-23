#version 450 core

layout (location = 0) out vec3 gPosition;
layout (location = 1) out vec3 gNormal;
layout (location = 2) out vec4 gAlbedoSpec;

in vec3 FragPos;
in vec3 Normal;
in vec2 TexCoords;

// 暫時用 uniform 顏色代替貼圖，方便除錯
uniform vec3 objectColor; 

void main()
{    
    // 1. 儲存世界座標
    gPosition = FragPos;
    
    // 2. 儲存法線
    gNormal = normalize(Normal);
    
    // 3. 儲存顏色 (RGB) 和 高光強度 (Alpha)
    gAlbedoSpec.rgb = objectColor; // 這裡先用純色，之後可以換成 texture(diffuseMap, TexCoords).rgb
    gAlbedoSpec.a = 0.5; // 假設高光強度為 0.5
}