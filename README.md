# Kombogame - Gamer Chat Platform

Arkadaşlarınızla oyun oynarken kullanabileceğiniz, kayıt gerektirmeyen, hızlı ve şık bir sesli/görüntülü sohbet uygulaması.

## Özellikler
- **Kayıt Yok:** Sadece kullanıcı adı ve oda ismi girin.
- **P2P İletişim:** Düşük gecikmeli ses ve görüntü (WebRTC).
- **Ekran Paylaşımı:** Oyununuzu arkadaşlarınıza izletin.
- **Gamer Teması:** Siyah ve Cyan neon renkler.

## Nasıl Çalıştırılır?

Bu projeyi çalıştırmak için iki terminal penceresine ihtiyacınız var.

### 1. Sunucuyu Başlatın (Backend)
WebRTC bağlantılarını yöneten sunucuyu açın:
```bash
node server/index.js
```
Terminalde `Server listening on port 3000` yazısını görmelisiniz.

### 2. Arayüzü Başlatın (Frontend)
Yeni bir terminal açın ve arayüzü başlatın:
```bash
npm run dev
```
Size `http://localhost:5173` gibi bir link verecek. Bu linke tıklayarak tarayıcıda açın.

## Arkadaşlarla Oynama (Local Network / İnternet)
- **Aynı Evde (LAN):** Bilgisayarınızın yerel IP adresini (örn: 192.168.1.XX:5173) arkadaşlarınıza vererek bağlanmalarını sağlayabilirsiniz.
- **İnternet Üzerinden:** Cloudflare Tunnel veya benzeri bir servisle `localhost:5173` adresini dışarıya açmanız gerekir. WebRTC, localhost haricinde **HTTPS** zorunluluğu ister.

## Kontroller
- **Mikrofon:** Sesi aç/kapa.
- **Ekran:** Ekran paylaşımını başlat/durdur.
- **Chat:** Sağ taraftaki panelden mesajlaşın.

## Testler

Backend soket mantığını ve bağlantı senaryolarını test etmek için aşağıdaki komutu kullanabilirsiniz:

```bash
npm test
```
Bu komut `server/index.test.js` dosyasındaki testleri çalıştırır.
