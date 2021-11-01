import Head from 'next/head';

export default function HeadComponent() {
  return <Head>
    <title>Interdependence</title>
    <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=Roboto+Mono&display=swap" rel="stylesheet"/>
    <link rel="icon" href="/favicon.jpeg" />
    
    <meta
          property="og:description"
          content="Declaration of the Interdependence of Cyberspace"
        />
    
    <meta property="og:image" content={"/public/og-image.png"} />
    

  </Head>
}