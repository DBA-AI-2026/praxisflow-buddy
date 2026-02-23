/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="de" dir="ltr">
    <Head />
    <Preview>Passwort zurücksetzen – HFX Sales Portal</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img
          src="https://gvsxentbbzuyanqbqvea.supabase.co/storage/v1/object/public/email-assets/logo.jpeg?v=1"
          alt="HFX Honorarfuchs"
          width="60"
          style={logo}
        />
        <Heading style={h1}>Passwort zurücksetzen</Heading>
        <Text style={text}>
          Sie haben eine Anfrage zum Zurücksetzen Ihres Passworts für das HFX Sales Portal erhalten. Klicken Sie auf den Button, um ein neues Passwort zu wählen.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Neues Passwort setzen
        </Button>
        <Text style={footer}>
          Falls Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren. Ihr Passwort bleibt unverändert.
        </Text>
        <Text style={brand}>© HFX Honorarfuchs – Das Portal für den Vertrieb</Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

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
const button = {
  backgroundColor: '#b6193d',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '8px',
  padding: '12px 24px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
const brand = { fontSize: '11px', color: '#bbbbbb', margin: '8px 0 0' }
