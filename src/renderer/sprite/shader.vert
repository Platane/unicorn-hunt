#version 300 es
precision highp float;

layout(std140) uniform Camera {
    mat4 projectionMatrix;
    mat4 viewMatrix;
    vec3 lightDirection;
    float time;
};

in vec2 a_position;
in vec2 a_texCoord;

in vec4 a_objectMatrix1;
in vec4 a_objectMatrix2;
in vec4 a_objectMatrix3;
in vec4 a_objectMatrix4;
in vec4 a_spriteBox;

out vec2 v_texCoord;

void main() {

    // as it is not possible to pass a mat as attribute,
    // pass 4 vec4 instead and reconstruct here
    mat4 a_objectMatrix = mat4(a_objectMatrix1, a_objectMatrix2, a_objectMatrix3, a_objectMatrix4);

    vec4 p = vec4(a_position, 0.0, 1.0);

    gl_Position = projectionMatrix * viewMatrix * a_objectMatrix * p;
    v_texCoord = mix(a_spriteBox.xy, a_spriteBox.zw, a_texCoord);
}
