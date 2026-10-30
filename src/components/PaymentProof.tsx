"use client";

import { useEffect, useState } from "react";
import { prepareProofImage } from "@/lib/client/proof-image";
import styles from "./PaymentProof.module.scss";

type PaymentProofProps = {
  mode: string;
  image: Blob | null;
  uploaded: boolean;
  disabled: boolean;
  onChange: (image: Blob) => void;
  onProcessing: (busy: boolean) => void;
};

export function PaymentProof({
  mode,
  image,
  uploaded,
  disabled,
  onChange,
  onProcessing,
}: PaymentProofProps) {
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!image) {
      setPreview("");
      return;
    }

    const url = URL.createObjectURL(image);
    setPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [image]);

  if (!mode) return null;

  const label =
    mode === "cash"
      ? "Cash receipt"
      : mode === "finance"
        ? "Finance receipt or confirmation"
        : "Payment confirmation screenshot";

  const description =
    mode === "cash"
      ? "Upload a clear photo of the cash receipt."
      : mode === "finance"
        ? "Upload the finance receipt or payment confirmation with its reference ID."
        : "Upload the successful payment confirmation showing the transaction ID.";

  return (
    <div className={styles.proof}>
      <label htmlFor="payment-proof">{label}</label>

      <p>{description}</p>

      <input
        id="payment-proof"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled || processing}
        aria-describedby="payment-proof-help"
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];

          // Allow selecting the same file again after a failed attempt.
          event.currentTarget.value = "";

          if (!file) return;

          setError("");
          setProcessing(true);
          onProcessing(true);

          try {
            // Validates the 20 MB original, resizes to 1080 pixels,
            // and prepares JPEG without requiring browser WebP encoding.
            const prepared = await prepareProofImage(file);
            onChange(prepared);
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : "Could not prepare this image. Try a JPG, PNG or screenshot.",
            );
          } finally {
            setProcessing(false);
            onProcessing(false);
          }
        }}
      />

      {preview && (
        <img
          src={preview}
          alt="Selected payment proof"
          className={styles.preview}
        />
      )}

      {processing ? (
        <p role="status">Preparing image…</p>
      ) : image ? (
        <p role="status">
          {uploaded
            ? "Image uploaded."
            : "Image ready. It will upload when you submit."}{" "}
          Check that the receipt or transaction ID is readable.
        </p>
      ) : uploaded ? (
        <p role="status">
          Image uploaded. Choose another image to replace it.
        </p>
      ) : null}

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <small id="payment-proof-help">
        JPG, PNG or WebP up to 20 MB. Resized to a maximum of 1080 pixels
        on the longest side, without cropping. Saved as WebP.
      </small>
    </div>
  );
}