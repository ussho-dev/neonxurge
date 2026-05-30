import type { Metadata } from "next";
import { Geist, Geist_Mono, Orbitron } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
});

export const metadata: Metadata = {
  title: "NeonXurge | Cyberpunk Survivor",
  description: "NeonXurge — Fast-paced cyberpunk survivor game. Survive the neon drones. Collect XP. Beat your high score.",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "NeonXurge | Cyberpunk Survivor",
    description: "Fast-paced cyberpunk survivor roguelite. 10 intense stages, deep skill fusion, equipment progression, and optional on-chain leaderboards & NFTs.",
    siteName: "NeonXurge",
  },
  twitter: {
    card: "summary_large_image",
    title: "NeonXurge | Cyberpunk Survivor",
    description: "Fast-paced cyberpunk survivor roguelite. 10 intense stages, deep skill fusion, equipment progression, and optional on-chain leaderboards & NFTs.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${orbitron.variable} h-full antialiased dark`}
    >
      <body className="min-h-full bg-black text-white flex flex-col">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
