"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./PublicForm.module.scss";
type Widget = { render: (target: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void };
declare global { interface Window { turnstile?: Widget } }
let loading: Promise<void> | null = null;
function loadWidget(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!loading) loading = new Promise((resolve,reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { script.remove(); loading = null; reject(new Error("Security check could not load.")); };
    document.head.appendChild(script);
  });
  return loading;
}
export function BotCheck({siteKey,browserId,generation,onToken}:{siteKey:string;browserId:string;generation:number;onToken:(token:string)=>void}) {
  const target=useRef<HTMLDivElement>(null);
  const callback=useRef(onToken); callback.current=onToken;
  const [error,setError]=useState("");
  useEffect(() => {
    let disposed=false,id:string|undefined;
    callback.current(""); setError("");
    void loadWidget().then(() => {
      if(disposed||!target.current||!window.turnstile)return;
      id=window.turnstile.render(target.current,{
        sitekey:siteKey,action:"send_otp",cData:browserId,theme:"light",size:"compact",
        callback:(token:string)=>callback.current(token),
        "expired-callback":()=>callback.current(""),
        "error-callback":()=>{callback.current("");setError("Security check failed. Refresh the check to try again.");},
      });
    }).catch(()=>{if(!disposed)setError("Security check could not load. Reconnect and refresh the check.");});
    return()=>{disposed=true;if(id&&window.turnstile)window.turnstile.remove(id);};
  },[siteKey,browserId,generation]);
  return <div className={styles.botCheck}><div ref={target} />{error&&<p role="alert">{error}</p>}</div>;
}
