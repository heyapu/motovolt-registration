"use client";
import { useEffect, useState } from "react";
import { prepareProofImage } from "@/lib/client/proof-image";
import styles from "./PaymentProof.module.scss";
export function PaymentProof({ mode, image, uploaded, disabled, onChange, onProcessing }: {
  mode: string; image: Blob | null; uploaded: boolean; disabled: boolean;
  onChange: (image: Blob) => void; onProcessing: (busy: boolean) => void;
}) {
  const [preview, setPreview] = useState(""), [error, setError] = useState(""), [processing, setProcessing] = useState(false);
  useEffect(() => { if (!image) {setPreview("");return;} const url=URL.createObjectURL(image);setPreview(url);return()=>URL.revokeObjectURL(url); }, [image]);
  if (!mode) return null;
  const label = mode === "cash" ? "Cash receipt" : mode === "finance" ? "Finance receipt or confirmation" : "Payment confirmation screenshot";
  return <div className={styles.proof}>
    <label htmlFor="payment-proof">{label}</label>
    <p>{mode === "cash" ? "Upload a clear photo of the cash receipt." : mode === "finance" ? "Upload the finance receipt or payment confirmation with its reference ID." : "Upload the successful payment confirmation showing the transaction ID."}</p>
    <input id="payment-proof" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || processing}
      onChange={async e => {
        const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(!file)return;
        setError("");setProcessing(true);onProcessing(true);
        try { onChange(await prepareProofImage(file)); } catch(error) {setError(error instanceof Error?error.message:"Could not prepare this image.");}
        finally {setProcessing(false);onProcessing(false);}
      }} />
    {preview && <img src={preview} alt="Selected payment proof" className={styles.preview} />}
    {processing ? <p role="status">Preparing image…</p> : image ? <p role="status">{uploaded ? "Image uploaded." : "Image ready. It will upload when you submit."} Check that the receipt or transaction ID is readable.</p> : uploaded ? <p role="status">Image uploaded. Choose another image to replace it.</p> : null}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <small>JPG, PNG or WebP up to 8 MB. Saved as WebP, up to 500 × 500 pixels, without cropping.</small>
  </div>;
}
