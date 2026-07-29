import type { Metadata } from "next";
import SeventeenGame from "./SeventeenGame";

export const metadata: Metadata = {
  title: "17 만들기 | minguu.dev",
  description: "네 장의 카드와 창의적인 연산으로 17을 만드는 숫자 퍼즐",
};

export default function SeventeenPage() {
  return <SeventeenGame />;
}
