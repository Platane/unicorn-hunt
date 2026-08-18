#version 300 es
precision highp float;

layout(std140) uniform Camera {
    mat4 projectionMatrix;
    mat4 viewMatrix;
    vec3 lightDirection;
    float time;
};

uniform sampler2D u_colorPalettesTexture;

in vec3 a_position;
in vec3 a_normal;
in float a_colorIndex;

in vec4 a_objectMatrix1;
in vec4 a_objectMatrix2;
in vec4 a_objectMatrix3;
in vec4 a_objectMatrix4;
in vec4 a_colorPalette;

out vec3 v_normal;
out vec3 v_color;
flat out int v_instanceIndex;

void main() {

    // as it is not possible to pass a mat as attribute,
    // pass 4 vec4 instead and reconstruct here
    mat4 a_objectMatrix = mat4(a_objectMatrix1, a_objectMatrix2, a_objectMatrix3, a_objectMatrix4);

    vec4 p = vec4(a_position, 1.0);

    gl_Position = projectionMatrix * viewMatrix * a_objectMatrix * p;

    v_normal = mat3(a_objectMatrix) * a_normal;
    v_normal = normalize(v_normal);

    v_instanceIndex = gl_InstanceID;

    v_color = texelFetch(u_colorPalettesTexture, ivec2(int(a_colorIndex), int(a_colorPalette.x)), 0).xyz;
}
