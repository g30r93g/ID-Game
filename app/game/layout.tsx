export default function GameLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={"min-h-svh max-h-lvh flex items-center justify-center"}>
      {children}
    </div>
  )
}