"use client";

/**
 * Pure re-encryption of every raw (ciphertext) row fetched for a "Rotate
 * vault" run (Phase 3.5.6) — decrypts each field under the DEK already
 * unlocked in memory, re-encrypts it under the freshly generated one. No
 * UI, no network; `rotate-vault-settings.tsx` is the only caller.
 */

import { decryptField, decryptPacked, encryptField, encryptPacked } from "./crypto";
import type { RotationRawData } from "./rotation-queries";
import type { RotationInput } from "./rotation-actions";

async function rePacked(value: string, oldDek: CryptoKey, newDek: CryptoKey): Promise<string> {
  return encryptPacked(await decryptPacked(value, oldDek), newDek);
}

async function rePackedNullable(
  value: string | null,
  oldDek: CryptoKey,
  newDek: CryptoKey,
): Promise<string | null> {
  return value === null ? null : rePacked(value, oldDek, newDek);
}

export async function reencryptForRotation(
  raw: RotationRawData,
  oldDek: CryptoKey,
  newDek: CryptoKey,
): Promise<
  Omit<
    RotationInput,
    "passwordWrap" | "passwordSalt" | "passwordKdfParams" | "recoveryWrap" | "recoverySalt"
  >
> {
  const [
    income,
    expenses,
    budgets,
    goals,
    goalContributions,
    loans,
    loanPayments,
    investments,
    investmentContributions,
    netWorthSnapshots,
    recurringRules,
    notifications,
    aiProviderKeys,
  ] = await Promise.all([
    Promise.all(
      raw.income.map(async (r) => ({
        id: r.id,
        amount: await rePacked(r.amount, oldDek, newDek),
        description: await rePackedNullable(r.description, oldDek, newDek),
      })),
    ),
    Promise.all(
      raw.expenses.map(async (r) => ({
        id: r.id,
        amount: await rePacked(r.amount, oldDek, newDek),
        description: await rePackedNullable(r.description, oldDek, newDek),
        note: await rePackedNullable(r.note, oldDek, newDek),
        tags: await rePackedNullable(r.tags, oldDek, newDek),
      })),
    ),
    Promise.all(
      raw.budgets.map(async (r) => ({ id: r.id, amount: await rePacked(r.amount, oldDek, newDek) })),
    ),
    Promise.all(
      raw.goals.map(async (r) => ({
        id: r.id,
        targetAmount: await rePacked(r.targetAmount, oldDek, newDek),
        currentAmount: await rePacked(r.currentAmount, oldDek, newDek),
        monthlyContribution: await rePackedNullable(r.monthlyContribution, oldDek, newDek),
      })),
    ),
    Promise.all(
      raw.goalContributions.map(async (r) => ({
        id: r.id,
        amount: await rePacked(r.amount, oldDek, newDek),
      })),
    ),
    Promise.all(
      raw.loans.map(async (r) => ({
        id: r.id,
        principal: await rePacked(r.principal, oldDek, newDek),
        emi: await rePacked(r.emi, oldDek, newDek),
        remainingAmount: await rePacked(r.remainingAmount, oldDek, newDek),
        extraEmi: await rePackedNullable(r.extraEmi, oldDek, newDek),
      })),
    ),
    Promise.all(
      raw.loanPayments.map(async (r) => ({
        id: r.id,
        amount: await rePacked(r.amount, oldDek, newDek),
        principalComponent: await rePackedNullable(r.principalComponent, oldDek, newDek),
        interestComponent: await rePackedNullable(r.interestComponent, oldDek, newDek),
      })),
    ),
    Promise.all(
      raw.investments.map(async (r) => ({
        id: r.id,
        investedAmount: await rePacked(r.investedAmount, oldDek, newDek),
        currentValue: await rePacked(r.currentValue, oldDek, newDek),
        monthlyContribution: await rePackedNullable(r.monthlyContribution, oldDek, newDek),
      })),
    ),
    Promise.all(
      raw.investmentContributions.map(async (r) => ({
        id: r.id,
        amount: await rePacked(r.amount, oldDek, newDek),
      })),
    ),
    Promise.all(
      raw.netWorthSnapshots.map(async (r) => ({
        id: r.id,
        totalAssets: await rePacked(r.totalAssets, oldDek, newDek),
        totalLiabilities: await rePacked(r.totalLiabilities, oldDek, newDek),
        netWorth: await rePacked(r.netWorth, oldDek, newDek),
      })),
    ),
    Promise.all(
      raw.recurringRules.map(async (r) => ({
        id: r.id,
        amount: await rePacked(r.amount, oldDek, newDek),
      })),
    ),
    Promise.all(
      raw.notifications.map(async (r) => ({
        id: r.id,
        body: await rePackedNullable(r.body, oldDek, newDek),
      })),
    ),
    Promise.all(
      raw.aiProviderKeys.map(async (r) => {
        const plaintext = await decryptField({ ciphertext: r.encryptedKey, iv: r.keyIv }, oldDek);
        const reencrypted = await encryptField(plaintext, newDek);
        return { id: r.id, encryptedKey: reencrypted.ciphertext, keyIv: reencrypted.iv };
      }),
    ),
  ]);

  return {
    income,
    expenses,
    budgets,
    goals,
    goalContributions,
    loans,
    loanPayments,
    investments,
    investmentContributions,
    netWorthSnapshots,
    recurringRules,
    notifications,
    aiProviderKeys,
  };
}
