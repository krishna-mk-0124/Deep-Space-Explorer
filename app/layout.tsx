import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deep Space Explorer — Interactive Physics Sandbox",
  description:
    "Explore 100+ deep space objects with real-time physics simulations. Black holes, pulsars, binary stars, globular clusters, and orbital mechanics rendered in WebGL.",
  keywords: ["space", "physics", "simulation", "black hole", "pulsar", "three.js", "WebGL"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-black text-white antialiased overflow-hidden">{children}</body>
    </html>
  );
}
