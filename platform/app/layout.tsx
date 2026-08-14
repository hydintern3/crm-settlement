import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { BASE_PATH } from "./lib/deployment";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}${BASE_PATH}/og.png`;

  return {
    title: "衡析｜CRM 业务分析与结算管理平台",
    description: "面向业务与财务的可追溯数据分析、快速查询、报表和结算候选工作台。",
    icons: {
      icon: `${BASE_PATH}/favicon.svg`,
      shortcut: `${BASE_PATH}/favicon.svg`,
    },
    openGraph: {
      title: "衡析｜CRM 业务分析与结算管理平台",
      description: "可追溯、可复核、可扩展的业务数据工作台。",
      images: [{ url: imageUrl, width: 1732, height: 908, alt: "衡析 CRM 业务分析与结算管理平台" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "衡析｜CRM 业务分析与结算管理平台",
      description: "可追溯、可复核、可扩展的业务数据工作台。",
      images: [imageUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
