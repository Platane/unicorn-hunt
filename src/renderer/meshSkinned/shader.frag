#version 300 es
precision highp float;

layout(std140) uniform Camera {
    mat4 projectionMatrix;
    mat4 viewMatrix;
    vec3 lightDirection;
    float time;
};

in vec3 v_position;

layout(location = 0) out vec4 outColor;
layout(location = 1) out vec3 outNormal;

void main() {
    // flat shading
    vec3 normal = normalize(cross(dFdx(v_position), dFdy(v_position)));

    outNormal = normal;

    float p = dot(normal, lightDirection);

    outColor = vec4(vec3(0.85, 0.8, 0.9), 1.0);
    outColor.rgb *= 0.6 + clamp(abs(p), -0.47, 10.0) * 0.45;
}
