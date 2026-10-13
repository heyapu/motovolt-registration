"use client";
import styles from "@/components/PublicForm.module.scss";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className={styles.main}>
      <section className={styles.cardBody}>
        <h1>Could not open the form.</h1>
        <p>
          Reconnect and try again. Submitted entries remain in the database.
        </p>
        <button className={styles.primary} onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
