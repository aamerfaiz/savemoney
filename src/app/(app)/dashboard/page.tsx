import {
  Wallet,
  CreditCard,
  PiggyBank,
  LineChart,
} from "lucide-react";

import { BentoGrid, BentoCard } from "@/components/magic-bento/magic-bento";
import { StatTile } from "@/components/dashboard/stat-tile";
import { BudgetCard } from "@/components/dashboard/budget-card";
import { HealthGauge } from "@/components/dashboard/health-gauge";
import { NetWorthCard } from "@/components/dashboard/net-worth-card";
import { SpendingDonut } from "@/components/dashboard/spending-donut";
import { GoalsCard } from "@/components/dashboard/goals-card";
import { UpcomingCard } from "@/components/dashboard/upcoming-card";
import { RecentTransactions } from "@/components/dashboard/recent-transactions";
import { getDashboardData } from "@/data/mock-dashboard";
import { formatCurrency } from "@/lib/format";

export const metadata = { title: "Dashboard · Finance OS" };

export default async function DashboardPage() {
  const d = await getDashboardData();
  const c = d.currency;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
            Hello, {d.userName} 👋
          </h1>
          <p className="text-sm text-muted-foreground">
            Here&apos;s where your money stands today.
          </p>
        </div>
      </div>

      <BentoGrid>
        {/* KPI row */}
        <BentoCard enableStars>
          <StatTile
            label="Monthly Income"
            value={formatCurrency(d.monthlyIncome, c)}
            icon={Wallet}
            deltaPct={0.04}
            hint="vs last month"
            tone="positive"
          />
        </BentoCard>
        <BentoCard enableStars>
          <StatTile
            label="Monthly Expenses"
            value={formatCurrency(d.monthlyExpenses, c)}
            icon={CreditCard}
            deltaPct={-0.021}
            hint="vs last month"
          />
        </BentoCard>
        <BentoCard enableStars>
          <StatTile
            label="Savings"
            value={formatCurrency(d.savings, c)}
            icon={PiggyBank}
            deltaPct={0.08}
            tone="positive"
          />
        </BentoCard>
        <BentoCard enableStars>
          <StatTile
            label="Investments"
            value={formatCurrency(d.investments, c)}
            icon={LineChart}
            deltaPct={0.012}
          />
        </BentoCard>

        {/* Budget + Net worth */}
        <BentoCard span={2} enableStars enableMagnetism>
          <BudgetCard budget={d.budget} currency={c} />
        </BentoCard>
        <BentoCard span={2} enableStars>
          <NetWorthCard
            data={d.netWorthTrend}
            netWorth={d.netWorth}
            changePct={d.netWorthChangePct}
            currency={c}
          />
        </BentoCard>

        {/* Health + Spending */}
        <BentoCard span={2} enableStars enableMagnetism>
          <HealthGauge health={d.health} />
        </BentoCard>
        <BentoCard span={2} enableStars>
          <SpendingDonut data={d.spendingByCategory} currency={c} />
        </BentoCard>

        {/* Goals + Upcoming + Recent */}
        <BentoCard enableStars>
          <GoalsCard goals={d.goals} currency={c} />
        </BentoCard>
        <BentoCard enableStars>
          <UpcomingCard items={d.upcoming} currency={c} />
        </BentoCard>
        <BentoCard span={2} enableStars>
          <RecentTransactions items={d.recent} currency={c} />
        </BentoCard>
      </BentoGrid>
    </div>
  );
}
