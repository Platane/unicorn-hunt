#version 300 es
precision highp float;

layout(std140) uniform Camera {
    mat4 projectionMatrix;
    mat4 viewMatrix;
    vec3 lightDirection;
    float time;
};

#define MAX_BONES 16

// 2 vec4 per bone, the rotation quaternion then the translation in .xyz
uniform vec4 u_bones[MAX_BONES * 2];
uniform uint u_colorPalette;

uniform sampler2D u_colorPalettesTexture;

in vec3 a_position;
in vec4 a_boneWeight;
in uvec4 a_boneIndex;
in uint a_colorIndex;

out vec3 v_position;
out vec3 v_color;

vec3 qrot(vec4 q, vec3 v) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

void main() {
    vec3 p = vec3(0.0);

    for (int k = 0; k < 4; k++) {
        vec4 q = u_bones[int(a_boneIndex[k]) * 2 + 0];
        vec3 v = u_bones[int(a_boneIndex[k]) * 2 + 1].xyz;

        p += (qrot(q, a_position) + v) * a_boneWeight[k];
    }

    // the fragment shader derives the flat normal from this
    v_position = p;

    v_color = texelFetch(u_colorPalettesTexture, ivec2(int(a_colorIndex), int(u_colorPalette)), 0).xyz;

    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
