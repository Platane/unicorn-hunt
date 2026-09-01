#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_color;

layout(std140) uniform Camera {
    mat4 projectionMatrix;
    mat4 viewMatrix;
    vec3 lightDirection;
    float time;
};

layout(location = 0) out vec4 outColor;
layout(location = 1) out vec3 outNormal;

void main() {
    float p = dot(v_normal, lightDirection);

    outNormal = v_normal;

    outColor.rgba = vec4(v_color, 1.0);

    outColor.rgb *= 0.6 + clamp(p, -0.47, 10.0) * 0.45;
}
