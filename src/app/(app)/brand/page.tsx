"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingState } from "@/components/shared/states";
import { ScreenGuard } from "@/components/shared/screen-guard";
import { Field } from "@/components/shared/field";
import { ImageUpload } from "@/components/shared/image-upload";
import { toast } from "@/components/ui/use-toast";
import { useLang } from "@/components/providers/language-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { usePermissions } from "@/components/providers/permission-provider";
import { invalidateBrandCache } from "@/hooks/use-brand";
import { brandSchema, type BrandForm } from "@/lib/schemas";
import { getBrand, saveBrand } from "@/lib/firebase/services/settings";

export default function BrandPage() {
  return (
    <ScreenGuard screen="brand">
      <BrandContent />
    </ScreenGuard>
  );
}

function BrandContent() {
  const { t } = useLang();
  const { actor } = useAuth();
  const { can } = usePermissions();
  const [loading, setLoading] = useState(true);
  const form = useForm<BrandForm>({
    resolver: zodResolver(brandSchema),
    defaultValues: {
      companyEnglishName: "", companyArabicName: "", logoBase64: "", phone: "", email: "",
      addressEnglish: "", addressArabic: "", taxNumber: "", commercialRegistration: "",
      website: "", invoiceFooterEnglish: "", invoiceFooterArabic: "", currencyEnglish: "EGP", currencyArabic: "ج.م",
    },
  });
  const e = form.formState.errors;

  useEffect(() => {
    getBrand().then((b) => {
      if (b) form.reset({
        companyEnglishName: b.companyEnglishName || "", companyArabicName: b.companyArabicName || "",
        logoBase64: b.logoBase64 || "", phone: b.phone || "", email: b.email || "",
        addressEnglish: b.addressEnglish || "", addressArabic: b.addressArabic || "",
        taxNumber: b.taxNumber || "", commercialRegistration: b.commercialRegistration || "",
        website: b.website || "", invoiceFooterEnglish: b.invoiceFooterEnglish || "",
        invoiceFooterArabic: b.invoiceFooterArabic || "", currencyEnglish: b.currencyEnglish || "EGP",
        currencyArabic: b.currencyArabic || "ج.م",
      });
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // View-only users still see the data, just disabled (fieldset below). Editing requires edit access.

  async function onSubmit(data: BrandForm) {
    try {
      await saveBrand(data, actor);
      invalidateBrandCache();
      toast({ variant: "success", title: t("msg.saved") });
    } catch (err) {
      toast({ variant: "destructive", title: t("msg.error"), description: (err as Error).message });
    }
  }

  if (loading) return <LoadingState />;
  const readOnly = !can("brand", "edit");

  return (
    <div className="space-y-6">
      <PageHeader title={t("brand.title")}
        actions={!readOnly && <Button onClick={form.handleSubmit(onSubmit)} disabled={form.formState.isSubmitting}><Save className="h-4 w-4" /> {t("action.save")}</Button>}
      />
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <fieldset disabled={readOnly} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t("brand.logo")}</CardTitle></CardHeader>
            <CardContent>
              <ImageUpload value={form.watch("logoBase64")} onChange={(v) => form.setValue("logoBase64", v)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("brand.title")}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("brand.companyEnglish")} required error={e.companyEnglishName?.message}><Input {...form.register("companyEnglishName")} dir="ltr" /></Field>
              <Field label={t("brand.companyArabic")} required error={e.companyArabicName?.message}><Input {...form.register("companyArabicName")} dir="rtl" /></Field>
              <Field label={t("common.phone")}><Input {...form.register("phone")} dir="ltr" /></Field>
              <Field label={t("common.email")} error={e.email?.message}><Input {...form.register("email")} dir="ltr" /></Field>
              <Field label={t("brand.website")}><Input {...form.register("website")} dir="ltr" /></Field>
              <Field label={t("brand.tax")}><Input {...form.register("taxNumber")} dir="ltr" /></Field>
              <Field label={t("brand.cr")}><Input {...form.register("commercialRegistration")} dir="ltr" /></Field>
              <Field label={t("brand.currencyEnglish")}><Input {...form.register("currencyEnglish")} dir="ltr" /></Field>
              <Field label={t("brand.currencyArabic")}><Input {...form.register("currencyArabic")} dir="rtl" /></Field>
              <Field label={t("brand.companyEnglish") + " — " + t("common.address")}><Input {...form.register("addressEnglish")} dir="ltr" /></Field>
              <Field label={t("brand.companyArabic") + " — " + t("common.address")}><Input {...form.register("addressArabic")} dir="rtl" /></Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t("brand.footerEnglish")}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("brand.footerEnglish")}><Textarea {...form.register("invoiceFooterEnglish")} dir="ltr" /></Field>
              <Field label={t("brand.footerArabic")}><Textarea {...form.register("invoiceFooterArabic")} dir="rtl" /></Field>
            </CardContent>
          </Card>
        </fieldset>
      </form>
    </div>
  );
}
