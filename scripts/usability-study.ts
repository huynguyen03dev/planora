import { appendFile, mkdir } from "node:fs/promises";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

const tasks = [
  "Tạo workspace mới và một board",
  "Tạo hai list và kéo một card sang list còn lại",
  "Mời thành viên và thay đổi vai trò",
  "Mở Analytics và xác định số card hoàn thành",
  "Tạo một automation đơn giản",
];

async function main() {
  const rl = createInterface({ input, output });
  const participant = (await rl.question("Participant code (không dùng tên thật): ")).trim();
  const rows: object[] = [];

  for (const task of tasks) {
    console.log("\nTASK: " + task);
    await rl.question("Nhấn Enter khi người dùng bắt đầu...");
    const startedAt = Date.now();
    await rl.question("Nhấn Enter khi hoàn thành/bỏ cuộc...");
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    const success = (await rl.question("Hoàn thành? (y/n): ")).trim().toLowerCase() === "y";
    const errors = Number.parseInt(
      (await rl.question("Số lỗi/vướng mắc quan sát được: ")).trim() || "0",
      10,
    );
    const note = (await rl.question("Ghi chú ngắn: ")).trim();
    rows.push({
      participant,
      task,
      seconds,
      success,
      errors,
      note,
      recordedAt: new Date().toISOString(),
    });
  }

  const ease = Number.parseInt((await rl.question("\nMức dễ hiểu giao diện 1-5: ")).trim(), 10);
  rows.push({ participant, summary: true, ease, recordedAt: new Date().toISOString() });
  rl.close();

  await mkdir("docs/evidence", { recursive: true });
  await appendFile(
    "docs/evidence/usability-study.jsonl",
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
  );
  console.log("Đã ghi dữ liệu vào docs/evidence/usability-study.jsonl");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
