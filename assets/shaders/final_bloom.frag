#version 450 core
out vec4 FragColor;
in vec2 TexCoords;

uniform sampler2D scene;      // 原始 HDR 場景
uniform sampler2D bloomBlur;  // 模糊後的亮部
uniform float exposure;       // 曝光度控制

void main()
{             
    vec3 hdrColor = texture(scene, TexCoords).rgb;      
    vec3 bloomColor = texture(bloomBlur, TexCoords).rgb;
    
    // 1. 疊加 (Additive Blending)
    hdrColor += bloomColor; // 就是這麼簡單，加在一起就會發光

    // 2. Tone Mapping (Reinhard 或 Exposure)
    // 這裡用 Exposure Tone Mapping，效果比較好控制
    vec3 result = vec3(1.0) - exp(-hdrColor * exposure);
    
    // 3. Gamma Correction
    const float gamma = 2.2;
    result = pow(result, vec3(1.0 / gamma));

    FragColor = vec4(result, 1.0);
}