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
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface EmailChangeEmailProps {
  siteName: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  email,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="de" dir="ltr">
    <Head />
    <Preview>E-Mail-Änderung bestätigen – HFX Sales Portal</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img
          src="https://gvsxentbbzuyanqbqvea.supabase.co/storage/v1/object/public/email-assets/logo.jpeg?v=1"
          alt="HFX Honorarfuchs"
          width="60"
          style={logo}
        />
        <Heading style={h1}>E-Mail-Änderung bestätigen</Heading>
        <Text style={text}>
          Sie haben angefragt, Ihre E-Mail-Adresse für das HFX Sales Portal von{' '}
          <Link href={`mailto:${email}`} style={link}>
            {email}
          </Link>{' '}
          auf{' '}
          <Link href={`mailto:${newEmail}`} style={link}>
            {newEmail}
          </Link>{' '}
          zu ändern.
        </Text>
        <Text style={text}>
          Klicken Sie auf den Button, um die Änderung zu bestätigen:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Änderung bestätigen
        </Button>
        <Text style={footer}>
          Falls Sie diese Änderung nicht angefordert haben, sichern Sie bitte umgehend Ihr Konto.
        </Text>
        <Text style={brand}>© HFX Honorarfuchs – Das Portal für den Vertrieb</Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

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
const link = { color: '#0b367f', textDecoration: 'underline' }
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
