import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

import { resolverCredenciais } from './config'

let appInstancia: App | null = null
let firestoreInstancia: Firestore | null = null

/**
 * Inicializa o Firebase Admin SDK uma única vez por processo. A conexão é
 * compartilhada entre o servidor de produção e o middleware do Vite.
 */
export function obterApp(): App {
  if (appInstancia) return appInstancia

  if (getApps().length > 0) {
    appInstancia = getApps()[0]!
    return appInstancia
  }

  const { projectId, serviceAccountPath } = resolverCredenciais()

  if (!serviceAccountPath) {
    throw new Error(
      'Sem arquivo de credencial o SDK usaria Application Default Credentials, ' +
        'que não funciona fora do Google Cloud.',
    )
  }

  appInstancia = initializeApp({
    credential: cert(serviceAccountPath),
    projectId,
    storageBucket: `${projectId}.firebasestorage.app`,
  })

  return appInstancia
}

export function obterFirestore(): Firestore {
  if (!firestoreInstancia) {
    firestoreInstancia = getFirestore(obterApp())
    firestoreInstancia.settings({ ignoreUndefinedProperties: true })
  }
  return firestoreInstancia
}

/** Reservado para fluxos futuros que exigirem verificação de token do Firebase. */
export function obterAuthAdmin() {
  return getAuth(obterApp())
}