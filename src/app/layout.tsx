import type { Metadata } from "next";
import { AuthProvider } from "@/contexts/AuthContext";
import { SupabaseConnectionTest } from "@/components/SupabaseConnectionTest";
import "./globals.css";

export const metadata: Metadata = {
  title: "Decision Fitness",
  description: "Decide con claridad",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased font-sans">
        <AuthProvider>
          {process.env.NODE_ENV === "development" && <SupabaseConnectionTest />}
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
