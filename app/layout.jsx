import "./globals.css";

export const metadata = {
  title: "Homeview — accurate home design visualization",
  description:
    "A fast three.js rendering pipeline for visualizing home color schemes and designs across property developments.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
