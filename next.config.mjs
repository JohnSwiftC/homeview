/** @type {import('next').NextConfig} */
const nextConfig = {
  // The viewer mutates real DOM nodes imperatively (three.js + hand-rolled
  // selectors). StrictMode's double-invoke would init the renderer twice, so
  // we keep it off — the single mount is intentional for this escape-hatch.
  reactStrictMode: false,
};

export default nextConfig;
