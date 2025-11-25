#version 450 core
out vec4 FragColor;
in vec2 TexCoords;

uniform sampler2D scene;      // 原始 HDR 場景
uniform sampler2D bloomBlur;  // 模糊後的亮部
uniform float exposure;       // 曝光度
uniform float uTime;          // ★ 需要從 C++ 傳入時間 (做雜訊動畫用)

// --- 隨機函數 (生成雜訊) ---
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

void main()
{             
    // ------------------------------------------------
    // 1. 色差 (Chromatic Aberration) - 賽博龐克核心
    // ------------------------------------------------
    // 計算當前像素距離螢幕中心的距離
    float dist = distance(TexCoords, vec2(0.5));
    
    // 偏移量：離中心越遠，RGB 分離越嚴重
    // 0.003 是偏移強度，可自行調整
    vec2 offset = vec2(0.003 * dist * dist, 0.0); 

    // 分別讀取 R, G, B 通道
    float red   = texture(scene, TexCoords - offset).r;
    float green = texture(scene, TexCoords).g; // 綠色在原位
    float blue  = texture(scene, TexCoords + offset).b;
    
    vec3 hdrColor = vec3(red, green, blue);

    // ------------------------------------------------
    // 2. 疊加 Bloom
    // ------------------------------------------------
    vec3 bloomColor = texture(bloomBlur, TexCoords).rgb;
    hdrColor += bloomColor; // Additive blending

    // ------------------------------------------------
    // 3. Tone Mapping (Reinhard)
    // ------------------------------------------------
    vec3 result = vec3(1.0) - exp(-hdrColor * exposure);

    // ------------------------------------------------
    // 4. 暗角 (Vignette)
    // ------------------------------------------------
    // 邊緣變暗，中心保持亮
    float vignette = smoothstep(1.2, 0.4, dist); // 1.2是外圈，0.4是內圈
    // 也可以乘上顏色讓暗角帶點顏色 (例如深藍)
    result *= vignette;

    // ------------------------------------------------
    // 5. 底片雜訊 (Film Grain)
    // ------------------------------------------------
    // 利用時間讓雜訊動起來
    float noiseIntensity = 0.05; // 雜訊強度 (不要太大)
    float noise = random(TexCoords + uTime);
    
    // 混合雜訊 (讓暗部雜訊更明顯)
    result += (noise - 0.5) * noiseIntensity;

    // ------------------------------------------------
    // 6. Gamma Correction
    // ------------------------------------------------
    const float gamma = 2.2;
    result = pow(result, vec3(1.0 / gamma));

    FragColor = vec4(result, 1.0);
}