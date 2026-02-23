/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="de" dir="ltr">
    <Head />
    <Preview>Ihr Bestätigungscode – HFX Sales Portal</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img
          src="https://gvsxentbbzuyanqbqvea.supabase.co/storage/v1/object/public/email-assets/logo.jpeg?v=1"
          alt="HFX Honorarfuchs"
          width="60"
          style={logo}
        />
        <Heading style={h1}>Bestätigungscode</Heading>
        <Text style={text}>Verwenden Sie den folgenden Code, um Ihre Identität zu bestätigen:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          Dieser Code ist nur kurze Zeit gültig. Falls Sie ihn nicht angefordert haben, können Sie diese E-Mail ignorieren.
        </Text>
        <Text style={brand}>© HFX Honorarfuchs – Das Portal für den Vertrieb</Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: "Inter, system-ui, sans-serif" }
const container = { padding: '30px 25px' }
const logo = { marginBottom: '24px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#0b367f',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#506585',
  lineHeight: '1.6',
  margin: '0 0 20px',
}
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: '#0b367f',
  backgroundColor: '#f0f4f8',
  padding: '16px 20px',
  borderRadius: '8px',
  margin: '0 0 30px',
  letterSpacing: '4px',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
const brand = { fontSize: '11px', color: '#bbbbbb', margin: '8px 0 0' }
