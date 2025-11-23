#version 450 core

out vec4 FragColor;
uniform vec3 lightColor;

void main()
{
    // 燈泡顏色就是光源顏色，不受光照影響
    FragColor = vec4(lightColor, 1.0);
}