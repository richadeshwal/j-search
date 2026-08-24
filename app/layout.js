import "./globals.css";

export const metadata = {
  title: "J-Search — AI/ML PM Job Tracker",
  description: "Daily-refreshed AI/ML Product & Project Manager job listings from LinkedIn, Indeed, and more.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
