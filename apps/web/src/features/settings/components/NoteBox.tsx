import { Info } from "lucide-react";
import { useLang } from "../../../lib/i18n.tsx";

export function NoteBox() {
  const { t } = useLang();
  return (
    <div className="bg-amber-soft rounded-xl border border-amber-line p-4">
      <div className="flex items-start gap-2">
        <Info className="w-4 h-4 text-amber-ink mt-0.5 shrink-0" />
        <div className="text-xs text-amber-ink leading-relaxed">
          <div className="font-bold">{t("settings.noteTitle")}</div>
          <p className="mt-1">{t("settings.noteDesc")}</p>
          <p className="mt-1 text-amber-ink">Tip: Dùng "Apply to server" để hot-reload (PUT /api/config) không cần restart. Sau đó vẫn nên copy snippet vào .env để persist qua reboot.</p>
        </div>
      </div>
    </div>
  );
}
