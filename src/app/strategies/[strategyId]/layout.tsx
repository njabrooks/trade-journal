import { ReactNode } from "react";

interface StrategyDetailLayoutProps {
  params: Promise<{ strategyId: string }>;
  children: ReactNode;
}

export default async function StrategyDetailLayout({
  params,
  children,
}: StrategyDetailLayoutProps) {
  // Layout just passes through - tabs will be rendered via subNav prop in page components
  return <>{children}</>;
}

