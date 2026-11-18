// Default to sample data when there is no database configuration. Explicit false opts out.
export const demoEnabled = process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || (
  process.env.NEXT_PUBLIC_DEMO_MODE !== 'false' && (
    !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project')
  )
)
