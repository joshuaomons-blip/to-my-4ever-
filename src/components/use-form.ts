'use client'

import { useState } from 'react'
import { api } from '@/lib/api'

/** Minimal form state helper that maps API field errors back onto inputs. */
export function useForm<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const set = <K extends keyof T>(key: K, value: T[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    if (errors[key as string]) setErrors((e) => ({ ...e, [key as string]: '' }))
  }

  async function submit<R>(path: string, body: unknown, method = 'POST') {
    setLoading(true)
    setError(null)
    setErrors({})
    const res = await api<R>(path, { method, body })
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      if (res.fields) setErrors(res.fields)
      return null
    }
    return res.data
  }

  return { values, set, setValues, errors, setErrors, error, setError, loading, setLoading, submit }
}
