// elements with an id are global
declare const c: HTMLCanvasElement;
declare const u: HTMLDivElement;

declare module "*.css";
declare module "*.module.css" {
  const styles: Record<string, string>;
  export default styles;
}
declare module "*.vert" {
  const src: string;
  export default src;
}
declare module "*.frag" {
  const src: string;
  export default src;
}
