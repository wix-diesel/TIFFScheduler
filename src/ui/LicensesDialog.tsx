import { useEffect, useRef, useState } from 'react';

type License = {
  name: string;
  version: string;
  identifier?: string;
  text?: string;
};

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; licenses: License[] }
  | { status: 'error' };

function isLicense(value: unknown): value is License {
  return typeof value === 'object'
    && value !== null
    && typeof (value as License).name === 'string'
    && typeof (value as License).version === 'string';
}

export function LicensesDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const close = () => dialog.close();
    dialog.addEventListener('cancel', close);
    return () => dialog.removeEventListener('cancel', close);
  }, []);

  const open = async () => {
    dialogRef.current?.showModal();
    if (loadState.status !== 'idle') return;
    setLoadState({ status: 'loading' });
    try {
      const response = await fetch(new URL('licenses.json', document.baseURI));
      const data: unknown = await response.json();
      if (!response.ok || !Array.isArray(data) || !data.every(isLicense)) throw new Error('Invalid license data');
      setLoadState({ status: 'loaded', licenses: data });
    } catch {
      setLoadState({ status: 'error' });
    }
  };

  let content;
  if (loadState.status === 'idle' || loadState.status === 'loading') {
    content = <p role="status">ライセンス情報を読み込んでいます…</p>;
  } else if (loadState.status === 'error') {
    content = <p role="alert">ライセンス情報を読み込めませんでした。ページを再読み込みして、もう一度お試しください。</p>;
  } else {
    content = <><p className="licenses-summary">このアプリケーションに同梱されているOSSとライセンスです。</p><ul className="licenses-list">{loadState.licenses.map(license => <li key={`${license.name}@${license.version}`}><h3>{license.name} <span>{license.version}</span></h3>{license.identifier && <p>{license.identifier}</p>}{license.text && <pre>{license.text}</pre>}</li>)}</ul></>;
  }

  return <>
    <button type="button" className="licenses-link" onClick={() => void open()}>Licenses</button>
    <dialog ref={dialogRef} className="licenses-dialog" aria-labelledby="licenses-heading">
      <div className="licenses-dialog__header">
        <h2 id="licenses-heading">OSS Licenses</h2>
        <button type="button" aria-label="ライセンス一覧を閉じる" onClick={() => dialogRef.current?.close()}>閉じる</button>
      </div>
      {content}
    </dialog>
  </>;
}
