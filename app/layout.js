import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { CatalogProvider } from "@/lib/CatalogContext";
import { WishlistProvider } from "@/lib/WishlistContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata = {
  title: "TechCompare BD — Compare. Build. Choose Smart.",
  description:
    "Bangladesh IT & gadget price comparison and PC builder platform. Compare prices across local retailers and build a compatible PC.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <CatalogProvider>
          <AuthProvider>
            <WishlistProvider>
              <Header />
              <main>{children}</main>
              <Footer />
            </WishlistProvider>
          </AuthProvider>
        </CatalogProvider>
      </body>
    </html>
  );
}
