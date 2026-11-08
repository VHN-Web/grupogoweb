"use client";
import { useTransition } from "react";
import { Icon } from "@/components/ui/Icon";
import { leadContactAction } from "@/app/crm/actions";

/** Abre WhatsApp/ligação/Instagram/e-mail e registra o contato no lead (conta na meta do dia). */
export function ContactButtons({ leadId, phone, instagram, email, text, size = "md" }: { leadId: string; phone: string | null; instagram: string | null; email: string | null; text?: string; size?: "sm" | "md" }) {
  const [, start] = useTransition();
  const digits = phone?.replace(/\D/g, "") ?? "";
  const mobile = digits.length === 13; // +55 DDD 9xxxx-xxxx
  const open = (channel: string, href: string) => {
    window.open(href, channel === "call" || channel === "email" ? "_self" : "_blank", "noopener");
    start(() => leadContactAction(leadId, channel));
  };
  const btn = size === "sm" ? "h-9 px-3 text-xs" : "h-11 px-4 text-sm";
  return (
    <div className="flex flex-wrap gap-2">
      {digits && mobile && (
        <button type="button" onClick={() => open("whatsapp", `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`)} className={`${btn} flex items-center gap-1.5 rounded-xl bg-[#25D366] font-bold text-[#0E0E10]`}>
          <Icon name="chat" size={16} /> WhatsApp
        </button>
      )}
      {digits && (
        <button type="button" onClick={() => open("call", `tel:+${digits}`)} className={`${btn} flex items-center gap-1.5 rounded-xl bg-[#1F7FD8] font-bold text-white`}>
          <Icon name="phone" size={16} /> Ligar
        </button>
      )}
      {instagram && (
        <button type="button" onClick={() => open("instagram", `https://instagram.com/${instagram}`)} className={`${btn} flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] font-bold text-white`}>
          <Icon name="instagram" size={16} /> Instagram
        </button>
      )}
      {email && (
        <button type="button" onClick={() => open("email", `mailto:${email}`)} className={`${btn} flex items-center gap-1.5 rounded-xl bg-[var(--s-soft)] font-bold`}>
          <Icon name="mail" size={16} /> E-mail
        </button>
      )}
    </div>
  );
}
