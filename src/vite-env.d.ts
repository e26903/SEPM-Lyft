/// <reference types="vite/client" />

declare module "*.mp4" {
  const src: string;
  export default src;
}

declare module "*.gif" {
  const src: string;
  export default src;
}

declare module "*.jpg" {
  const src: string;
  export default src;
}

interface Window {
  onYouTubeIframeAPIReady: () => void;
  YT: any;
}
