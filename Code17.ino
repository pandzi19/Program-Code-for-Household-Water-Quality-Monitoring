#include <Adafruit_ADS1X15.h>
#include <DallasTemperature.h>
#include <Firebase_ESP_Client.h>
#include <OneWire.h>
#include <WiFi.h>
#include <Wire.h>
#include <addons/RTDBHelper.h>
#include <addons/TokenHelper.h>
#include <time.h>

#define namaWiFi "(....)"
#define sandiWiFi "(....)"

#define API_KEY "AIzaSyBHhRbZUXGQ5UMVIasbuoHybWp14QPcACA"
#define DATABASE_URL "https://monitoring-kualitas-air-a4800-default-rtdb.asia-southeast1.firebasedatabase.app/"

const unsigned long intervalSampling = 1000;
const unsigned long intervalKirimRealtime = 60000;

#define LED_Biru 19
#define LED_Kuning 18
#define LED_Merah 5
#define pinSuhu 4

#define CHANNEL_PH 1
#define CHANNEL_TDS 2
#define CHANNEL_KEKERUHAN 0

const float BOBOT_PH = 0.30;
const float BOBOT_TDS = 0.30;
const float BOBOT_KEKERUHAN = 0.30;
const float BOBOT_SUHU = 0.10;

const float PH1_SLOPE = -17.02306;
const float PH1_OFFSET = 63.74913;
const float PH2_SLOPE = -10.39980;
const float PH2_OFFSET = 41.61134;
const float PH_BATAS = 3.34164;

const float TDS_SLOPE = 0.8618;
const float TDS_OFFSET = 4.6214;

const float KEKERUHAN_SLOPE = -163.934;
const float KEKERUHAN_OFFSET = 615.311;

OneWire kabelSuhu(pinSuhu);
DallasTemperature sensorSuhu(&kabelSuhu);
Adafruit_ADS1115 sensorADS1115;

int adcPH, adcTDS, adcKekeruhan;
float voltasePH, voltaseTDS, voltaseKekeruhan;
float suhuMentah;
bool sensorSuhuNormal = true;

float bufferVoltasePH[5] = {0.0};
int indeksBufferPH = 0;
int jumlahDataBufferPH = 0;

float nilaiPH;
float nilaiTDS;
float nilaiKekeruhan;
float nilaiSuhu;

float totalPHSatuMenit = 0;
float totalTDSSatuMenit = 0;
float totalKekeruhanSatuMenit = 0;
float totalSuhuSatuMenit = 0;
int jumlahSampelSatuMenit = 0;

float totalPHSatuJam = 0;
float totalTDSSatuJam = 0;
float totalKekeruhanSatuJam = 0;
float totalSuhuSatuJam = 0;
int jumlahSampelSatuJam = 0;

FirebaseData dataFirebase;
FirebaseAuth authFirebase;
FirebaseConfig configFirebase;

unsigned long waktuSamplingTerakhir = 0;
unsigned long waktuKirimRealtimeTerakhir = 0;
int jamTerakhirGrafik = -1;

bool statusKoneksiFirebase = false;
unsigned long totalWaktuTransmisi = 0;
unsigned long totalPaketDikirim = 0;
unsigned long totalPaketBerhasil = 0;
float rataRataDelay = 0;
float persentasePacketLoss = 0;

float bacaVoltaseMedian(int channel, int *simpanADC = nullptr) {
  int sampelADC[30];

  for (int i = 0; i < 30; i++) {
    sampelADC[i] = sensorADS1115.readADC_SingleEnded(channel);
    delay(2);
  }

  for (int i = 0; i < 29; i++) {
    for (int j = 0; j < 29 - i; j++) {
      if (sampelADC[j] > sampelADC[j + 1]) {
        int sementara = sampelADC[j];
        sampelADC[j] = sampelADC[j + 1];
        sampelADC[j + 1] = sementara;
      }
    }
  }

  int nilaiMedianADC = (sampelADC[14] + sampelADC[15]) / 2;
  if (simpanADC != nullptr) {
    *simpanADC = nilaiMedianADC;
  }

  return sensorADS1115.computeVolts(nilaiMedianADC);
}

void bacaSemuaSensor() {
  sensorSuhu.requestTemperatures();
  suhuMentah = sensorSuhu.getTempCByIndex(0);
  sensorSuhuNormal = true;
  if (suhuMentah == DEVICE_DISCONNECTED_C) {
    suhuMentah = 24.9;
    sensorSuhuNormal = false;
  }

  float medianBaruPH = bacaVoltaseMedian(CHANNEL_PH, &adcPH);
  bufferVoltasePH[indeksBufferPH] = medianBaruPH;
  indeksBufferPH = (indeksBufferPH + 1) % 5;
  if (jumlahDataBufferPH < 5) jumlahDataBufferPH++;

  float totalVoltasePH = 0.0;
  for (int i = 0; i < jumlahDataBufferPH; i++) {
    totalVoltasePH += bufferVoltasePH[i];
  }

  voltasePH = (jumlahDataBufferPH > 0) ? (totalVoltasePH / jumlahDataBufferPH) : medianBaruPH;
  voltaseTDS = bacaVoltaseMedian(CHANNEL_TDS, &adcTDS);
  voltaseKekeruhan = bacaVoltaseMedian(CHANNEL_KEKERUHAN, &adcKekeruhan);
}

float hitungNilaiSuhu() {
  return suhuMentah + 0.3;
}

float hitungNilaiPH() {
  float hasilPH;
  if (voltasePH >= PH_BATAS) {
    hasilPH = (PH1_SLOPE * voltasePH) + PH1_OFFSET;
  } else {
    hasilPH = (PH2_SLOPE * voltasePH) + PH2_OFFSET;
  }
  
  if (hasilPH < 0.0) hasilPH = 0.0;
  if (hasilPH > 14.0) hasilPH = 14.0;
  
  return hasilPH;
}

float hitungNilaiTDS() {
  float koefisienKompensasi = 1.0 + 0.02 * (nilaiSuhu - 25.0);
  float voltaseTerkompensasi = voltaseTDS / koefisienKompensasi;
  float nilaiTDSSebelumRegresi = (133.42 * pow(voltaseTerkompensasi, 3) - 255.86 * pow(voltaseTerkompensasi, 2) + 857.39 * voltaseTerkompensasi) * 0.5;
  
  float hasilTDS = (TDS_SLOPE * nilaiTDSSebelumRegresi) + TDS_OFFSET;
  if (hasilTDS < 0.0) hasilTDS = 0.0;
  
  return hasilTDS;
}

float hitungNilaiKekeruhan() {
  float hasilKekeruhan = (KEKERUHAN_SLOPE * voltaseKekeruhan) + KEKERUHAN_OFFSET;
  if (hasilKekeruhan < 0.0) hasilKekeruhan = 0.0;
  
  return hasilKekeruhan;
}

void hitungNilaiSemuaSensor() {
  nilaiSuhu = hitungNilaiSuhu();
  nilaiPH = hitungNilaiPH();
  nilaiTDS = hitungNilaiTDS();
  nilaiKekeruhan = hitungNilaiKekeruhan();
}

float hitungSkorSuhu(float rataRataSuhu) {
  float skor = 0;
  if (rataRataSuhu < 20 || rataRataSuhu > 36) skor = 0;
  else if (rataRataSuhu >= 20 && rataRataSuhu < 25) skor = 0 + (75 - 0) * ((rataRataSuhu - 20.0) / (25.0 - 20.0));
  else if (rataRataSuhu >= 25 && rataRataSuhu < 26) skor = 75 + (100 - 75) * ((rataRataSuhu - 25.0) / (26.0 - 25.0));
  else if (rataRataSuhu >= 26 && rataRataSuhu <= 30) skor = 100;
  else if (rataRataSuhu > 30 && rataRataSuhu <= 31) skor = 100 + (75 - 100) * ((rataRataSuhu - 30.0) / (31.0 - 30.0));
  else if (rataRataSuhu > 31 && rataRataSuhu <= 36) skor = 75 + (0 - 75) * ((rataRataSuhu - 31.0) / (36.0 - 31.0));
  return round(skor);
}

float hitungSkorPH(float rataRataPH) {
  float skor = 0;
  if (rataRataPH < 5 || rataRataPH > 10) skor = 0;
  else if (rataRataPH >= 5 && rataRataPH < 6.5) skor = 0 + (75 - 0) * ((rataRataPH - 5.0) / (6.5 - 5.0));
  else if (rataRataPH >= 6.5 && rataRataPH <= 7) skor = 75 + (100 - 75) * ((rataRataPH - 6.5) / (7.0 - 6.5));
  else if (rataRataPH > 7 && rataRataPH <= 8.5) skor = 100 + (75 - 100) * ((rataRataPH - 7.0) / (8.5 - 7.0));
  else if (rataRataPH > 8.5 && rataRataPH <= 10) skor = 75 + (0 - 75) * ((rataRataPH - 8.5) / (10.0 - 8.5));
  return round(skor);
}

float hitungSkorTDS(float rataRataTDS) {
  float skor = 0;
  if (rataRataTDS < 0 || rataRataTDS > 1000) skor = 0;
  else if (rataRataTDS >= 0 && rataRataTDS <= 300) skor = 100 + (75 - 100) * ((rataRataTDS - 0.0) / (300.0 - 0.0));
  else if (rataRataTDS > 300 && rataRataTDS <= 1000) skor = 75 + (0 - 75) * ((rataRataTDS - 300.0) / (1000.0 - 300.0));
  return round(skor);
}

float hitungSkorKekeruhan(float rataRataKekeruhan) {
  float skor = 0;
  if (rataRataKekeruhan < 0 || rataRataKekeruhan > 200) skor = 0;
  else if (rataRataKekeruhan >= 0 && rataRataKekeruhan <= 3) skor = 100 + (75 - 100) * ((rataRataKekeruhan - 0.0) / (3.0 - 0.0));
  else if (rataRataKekeruhan > 3 && rataRataKekeruhan <= 200) skor = 75 + (0 - 75) * ((rataRataKekeruhan - 3.0) / (200.0 - 3.0));
  return round(skor);
}

int hitungWQI(float rataRataPH, float rataRataTDS, float rataRataKekeruhan, float rataRataSuhu) {
  float kontribusiPH = hitungSkorPH(rataRataPH) * BOBOT_PH;
  float kontribusiTDS = hitungSkorTDS(rataRataTDS) * BOBOT_TDS;
  float kontribusiKekeruhan = hitungSkorKekeruhan(rataRataKekeruhan) * BOBOT_KEKERUHAN;
  float kontribusiSuhu = hitungSkorSuhu(rataRataSuhu) * BOBOT_SUHU;
  
  return round(kontribusiPH + kontribusiTDS + kontribusiKekeruhan + kontribusiSuhu);
}

String tentukanKategoriWQI(int &skorWQI, bool sensorMelewatiBatas) {
  if (sensorMelewatiBatas || skorWQI > 100 || skorWQI < 0) {
    skorWQI = 0;
    return "Sangat Buruk";
  }
  if (skorWQI >= 90) return "Sangat Baik";
  if (skorWQI >= 75) return "Baik";
  if (skorWQI >= 50) return "Cukup";
  if (skorWQI >= 25) return "Buruk";
  return "Sangat Buruk";
}

bool validasiDataSensor(float rataRataPH, float rataRataTDS, float rataRataKekeruhan, float rataRataSuhu) {
  bool batasPH = (rataRataPH < 5.0 || rataRataPH > 10.0);
  bool batasTDS = (rataRataTDS > 1000.0);
  bool batasKekeruhan = (rataRataKekeruhan > 200.0);
  bool batasSuhu = (rataRataSuhu < 20.0 || rataRataSuhu > 36.0);
  
  return (batasPH || batasTDS || batasKekeruhan || batasSuhu);
}

void perbaruiLED(int skorWQI) {
  if (skorWQI >= 75) {
    digitalWrite(LED_Biru, HIGH);
    digitalWrite(LED_Kuning, LOW);
    digitalWrite(LED_Merah, LOW);
  } else if (skorWQI >= 50) {
    digitalWrite(LED_Biru, LOW);
    digitalWrite(LED_Kuning, HIGH);
    digitalWrite(LED_Merah, LOW);
  } else {
    digitalWrite(LED_Biru, LOW);
    digitalWrite(LED_Kuning, LOW);
    digitalWrite(LED_Merah, HIGH);
  }
}

bool kirimNotifikasiBahayaFirebase(String waktuLengkap, String namaSensor, String namaParameter, float nilaiAnomali, String detailPesan, String tingkatBahaya) {
  FirebaseJson jsonPeringatan;
  jsonPeringatan.set("waktu", waktuLengkap);
  jsonPeringatan.set("sensor", namaSensor);
  jsonPeringatan.set("parameter", namaParameter);
  jsonPeringatan.set("nilai", nilaiAnomali);
  jsonPeringatan.set("detail", detailPesan);
  jsonPeringatan.set("status", tingkatBahaya);
  
  return Firebase.RTDB.pushJSON(&dataFirebase, "/history_alerts", &jsonPeringatan);
}

void kirimRealtimeFirebase(float rataRataPH, float rataRataTDS, float rataRataKekeruhan, float rataRataSuhu, int skorWQI, String kategoriWQI) {
  if (!statusKoneksiFirebase) return;

  FirebaseJson jsonRealtime;
  jsonRealtime.set("ph", rataRataPH);
  jsonRealtime.set("tds", rataRataTDS);
  jsonRealtime.set("temperature", rataRataSuhu);
  jsonRealtime.set("turbidity", rataRataKekeruhan);
  jsonRealtime.set("status", kategoriWQI);
  jsonRealtime.set("wqi", skorWQI);
  jsonRealtime.set("timestamp/.sv", "timestamp");

  unsigned long waktuMulaiKirim = millis();
  totalPaketDikirim++;

  if (Firebase.RTDB.setJSON(&dataFirebase, "/water_quality", &jsonRealtime)) {
    unsigned long delaySaatIni = millis() - waktuMulaiKirim;
    totalWaktuTransmisi += delaySaatIni;
    totalPaketBerhasil++;

    rataRataDelay = (float)totalWaktuTransmisi / totalPaketBerhasil;
    persentasePacketLoss = ((float)(totalPaketDikirim - totalPaketBerhasil) / totalPaketDikirim) * 100.0;

    Serial.println("\n===== QoS =====");
    Serial.printf("Rata-Rata Delay : %.2f ms\n", rataRataDelay);
    Serial.printf("Packet Loss     : %.2f %%\n", persentasePacketLoss);
    Serial.println("================");

    FirebaseJson jsonKualitasJaringan;
    jsonKualitasJaringan.set("delay_ms", rataRataDelay);
    jsonKualitasJaringan.set("packet_loss_percent", persentasePacketLoss);
    jsonKualitasJaringan.set("timestamp/.sv", "timestamp");

    struct tm waktuJaringan;
    String lokasiSimpanQoS = "/qos_logs";
    
    if (getLocalTime(&waktuJaringan)) {
      char formatWaktuLengkap[30], formatTanggalSaja[15];
      strftime(formatWaktuLengkap, sizeof(formatWaktuLengkap), "%Y-%m-%d %H:%M:%S", &waktuJaringan);
      jsonKualitasJaringan.set("waktu_lokal", String(formatWaktuLengkap));
      
      strftime(formatTanggalSaja, sizeof(formatTanggalSaja), "%Y-%m-%d", &waktuJaringan);
      lokasiSimpanQoS = "/qos_logs/" + String(formatTanggalSaja) + "/" + String(waktuJaringan.tm_hour) + "/" + String(waktuJaringan.tm_min);
    } else {
      jsonKualitasJaringan.set("waktu_lokal", "Waktu tidak sinkron");
      lokasiSimpanQoS = "/qos_logs/unsynced";
    }

    if (Firebase.RTDB.setJSON(&dataFirebase, lokasiSimpanQoS.c_str(), &jsonKualitasJaringan)) {
      Serial.println("Status Firebase: Log Jaringan berhasil disimpan!");
    } else {
      Serial.printf("Status Firebase: Gagal menyimpan log jaringan! %s\n", dataFirebase.errorReason().c_str());
    }
  } else {
    Serial.printf("Status Firebase: Gagal update data realtime! %s\n", dataFirebase.errorReason().c_str());
  }
}

void periksaDanKirimPeringatanSistem(float rataRataPH, float rataRataTDS, float rataRataKekeruhan, float rataRataSuhu, int skorWQI, String kategoriWQI, unsigned long waktuSekarang) {
  
  static String kategoriWQISebelumnya = "";
  if (kategoriWQI == "Buruk" || kategoriWQI == "Sangat Buruk") {
    if (kategoriWQI != kategoriWQISebelumnya) {
      FirebaseJson jsonPeringatanWQI;
      jsonPeringatanWQI.set("type", "WQI");
      jsonPeringatanWQI.set("value", skorWQI);
      jsonPeringatanWQI.set("category", kategoriWQI);

      String pesanSaran = "Kualitas air berada pada kategori " + kategoriWQI + "\n\n";
      pesanSaran += "Nilai WQI : " + String((float)skorWQI, 2) + "\n\n";
      
      if (kategoriWQI == "Buruk") {
        pesanSaran += "Disarankan melakukan pemeriksaan atau penggantian media filter.";
      } else {
        pesanSaran += "Segera lakukan pemeriksaan sistem filtrasi.";
      }
      
      jsonPeringatanWQI.set("message", pesanSaran);
      jsonPeringatanWQI.set("timestamp/.sv", "timestamp");

      struct tm waktuPeristiwa;
      if (getLocalTime(&waktuPeristiwa)) {
        char formatWaktuKejadian[30];
        strftime(formatWaktuKejadian, sizeof(formatWaktuKejadian), "%Y-%m-%d %H:%M:%S", &waktuPeristiwa);
        jsonPeringatanWQI.set("local_time", String(formatWaktuKejadian));
      } else {
        jsonPeringatanWQI.set("local_time", "Waktu tidak sinkron");
      }

      if (Firebase.RTDB.pushJSON(&dataFirebase, "/history_alerts", &jsonPeringatanWQI)) {
        Serial.println("Peringatan kondisi WQI berhasil dikirim.");
        kategoriWQISebelumnya = kategoriWQI;
      }
    }
  } else {
    kategoriWQISebelumnya = kategoriWQI;
  }

  static unsigned long waktuPeringatanSensorTerakhir = 0;
  if (waktuSekarang - waktuPeringatanSensorTerakhir > 60000) {
    struct tm waktuSaatKejadian;
    if (getLocalTime(&waktuSaatKejadian)) {
      char formatTanggalIndo[11], formatJamSaja[9];
      strftime(formatTanggalIndo, sizeof(formatTanggalIndo), "%d/%m/%Y", &waktuSaatKejadian);
      strftime(formatJamSaja, sizeof(formatJamSaja), "%H:%M:%S", &waktuSaatKejadian);
      String waktuKejadianLengkap = String(formatTanggalIndo) + " " + String(formatJamSaja);
      
      bool peringatanTerkirim = false;

      if (rataRataPH < 6.5) {
        if (kirimNotifikasiBahayaFirebase(waktuKejadianLengkap, "Sensor pH", "pH", rataRataPH, "Air terlalu Asam (pH < 6.5)", "danger")) peringatanTerkirim = true;
        yield();
      } else if (rataRataPH > 8.5) {
        if (kirimNotifikasiBahayaFirebase(waktuKejadianLengkap, "Sensor pH", "pH", rataRataPH, "Air terlalu Basa (pH > 8.5)", "danger")) peringatanTerkirim = true;
        yield();
      }

      if (rataRataKekeruhan > 200) {
        String detailPesan = (rataRataKekeruhan > 200) ? "Air sangat keruh!" : "Nilai Kekeruhan mendekati batas atas";
        if (kirimNotifikasiBahayaFirebase(waktuKejadianLengkap, "Sensor Turbidity", "Kekeruhan", rataRataKekeruhan, detailPesan, "warning")) peringatanTerkirim = true;
        yield();
      }

      if (rataRataTDS > 500) {
        if (kirimNotifikasiBahayaFirebase(waktuKejadianLengkap, "Sensor TDS", "TDS", rataRataTDS, "TDS tidak normal!", "warning")) peringatanTerkirim = true;
        yield();
      }

      if (rataRataSuhu < 20) {
        if (kirimNotifikasiBahayaFirebase(waktuKejadianLengkap, "Sensor Suhu", "Suhu", rataRataSuhu, "Suhu air terlalu dingin (< 20°C)", "warning")) peringatanTerkirim = true;
        yield();
      } else if (rataRataSuhu > 30) {
        if (kirimNotifikasiBahayaFirebase(waktuKejadianLengkap, "Sensor Suhu", "Suhu", rataRataSuhu, "Suhu air terlalu panas (> 30°C)", "warning")) peringatanTerkirim = true;
        yield();
      }

      if (peringatanTerkirim) {
        waktuPeringatanSensorTerakhir = waktuSekarang;
        Serial.println("Peringatan batas sensor berhasil dikirim.");
      }
    }
  }
}

void kirimHistoryFirebase() {
  struct tm waktuJaringan;
  if (!getLocalTime(&waktuJaringan)) return; 

  int jamSekarang = waktuJaringan.tm_hour;

  if (jamTerakhirGrafik == -1) {
    jamTerakhirGrafik = jamSekarang;
    return;
  }

  if (jamSekarang != jamTerakhirGrafik && jumlahSampelSatuJam > 0) {
    int jamRekamanTarget = jamTerakhirGrafik;

    if (jamRekamanTarget >= 0 && statusKoneksiFirebase) {
      float rataRataPHJam = totalPHSatuJam / jumlahSampelSatuJam;
      float rataRataTDSJam = totalTDSSatuJam / jumlahSampelSatuJam;
      float rataRataSuhuJam = totalSuhuSatuJam / jumlahSampelSatuJam;
      float rataRataKekeruhanJam = totalKekeruhanSatuJam / jumlahSampelSatuJam;

      char formatTanggalGrafik[12];
      struct tm waktuRekamanGrafik = waktuJaringan;
      
      if (jamSekarang == 0 && jamRekamanTarget == 23) {
        time_t waktuDimundurkan = mktime(&waktuRekamanGrafik) - 86400;
        localtime_r(&waktuDimundurkan, &waktuRekamanGrafik);
      }
      strftime(formatTanggalGrafik, sizeof(formatTanggalGrafik), "%Y-%m-%d", &waktuRekamanGrafik);

      String jalurSimpanGrafik = "/history_logs/" + String(formatTanggalGrafik) + "/" + String(jamRekamanTarget);

      Serial.println("\n=== [MENGIRIM DATA GRAFIK 1 JAM] ===");
      Serial.printf("Tanggal Grafik: %s | Jam: %d\n", formatTanggalGrafik, jamRekamanTarget);
      Serial.printf("Total Sampel  : %d\n", jumlahSampelSatuJam);

      FirebaseJson jsonGrafikSatuJam;
      jsonGrafikSatuJam.set("ph", rataRataPHJam);
      jsonGrafikSatuJam.set("tds", rataRataTDSJam);
      jsonGrafikSatuJam.set("temperature", rataRataSuhuJam);
      jsonGrafikSatuJam.set("turbidity", rataRataKekeruhanJam);
      
      String formatJamString = (jamRekamanTarget < 10) ? "0" + String(jamRekamanTarget) : String(jamRekamanTarget);
      jsonGrafikSatuJam.set("timestamp", String(formatTanggalGrafik) + " " + formatJamString + ":00");

      if (Firebase.RTDB.setJSON(&dataFirebase, jalurSimpanGrafik.c_str(), &jsonGrafikSatuJam)) {
        Serial.println("Status Firebase: Berhasil Kirim Data Grafik!");
      } else {
        Serial.printf("Status Firebase: Gagal Kirim Data Grafik!\n%s\n", dataFirebase.errorReason().c_str());
      }
    }

    totalSuhuSatuJam = 0;
    totalPHSatuJam = 0;
    totalTDSSatuJam = 0;
    totalKekeruhanSatuJam = 0;
    jumlahSampelSatuJam = 0;
    
    jamTerakhirGrafik = jamSekarang;
  }
}

void cetakJudulSerial(String teksJudul) {
  Serial.println("\n====================================================");
  Serial.println(teksJudul);
  Serial.println("====================================================");
}

void cetakSubJudulSerial(String teksSubJudul) {
  Serial.println("\n" + teksSubJudul);
  Serial.println("--------------------------------------------");
}

void cetakDataSerial(float rataRataPH, float rataRataTDS, float rataRataKekeruhan, float rataRataSuhu, int skorWQI, String kategoriWQI) {
  cetakJudulSerial("           HASIL MONITORING (RATA-RATA 1 MENIT)");

  cetakSubJudulSerial("SUHU");
  Serial.printf("Mentah DS18B20 : %.2f °C\n", suhuMentah);
  Serial.printf("Kalibrasi      : %.2f °C\n", rataRataSuhu);

  cetakSubJudulSerial("PH");
  Serial.printf("Mentah ADC     : %d\n", adcPH);
  Serial.printf("Voltase        : %.5f V\n", voltasePH);
  Serial.printf("Nilai pH       : %.2f\n", rataRataPH);

  cetakSubJudulSerial("TDS");
  Serial.printf("Mentah ADC     : %d\n", adcTDS);
  Serial.printf("Voltase        : %.5f V\n", voltaseTDS);
  Serial.printf("Nilai TDS      : %.2f ppm\n", rataRataTDS);

  cetakSubJudulSerial("KEKERUHAN (TURBIDITY)");
  Serial.printf("Mentah ADC     : %d\n", adcKekeruhan);
  Serial.printf("Voltase        : %.5f V\n", voltaseKekeruhan);
  Serial.printf("Nilai NTU      : %.2f NTU\n", rataRataKekeruhan);

  cetakJudulSerial("RATA-RATA 1 MENIT KESELURUHAN");
  Serial.printf("Suhu           : %.2f °C\n", rataRataSuhu);
  Serial.printf("pH             : %.2f\n", rataRataPH);
  Serial.printf("TDS            : %.2f ppm\n", rataRataTDS);
  Serial.printf("Kekeruhan      : %.2f NTU\n", rataRataKekeruhan);

  cetakJudulSerial("STATUS WATER QUALITY INDEX (WQI)");
  Serial.printf("Skor Kualitas  : %d\n", skorWQI);
  Serial.printf("Kategori       : %s\n", kategoriWQI.c_str());
  Serial.println("====================================================");
}

void setup() {
  Serial.begin(115200);
  
  sensorSuhu.begin();
  sensorSuhu.setResolution(12);
  sensorSuhu.setWaitForConversion(true);
  
  Wire.begin(21, 22);
  if (!sensorADS1115.begin(0x48)) {
    Serial.println("Peringatan: Modul ADS1115 gagal terhubung! Mengulang sistem...");
    delay(3000);
    ESP.restart();
  }
  sensorADS1115.setGain(GAIN_ONE);

  Serial.print("Proses menghubungkan WiFi: ");
  WiFi.begin(namaWiFi, sandiWiFi);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print("*");
  }
  Serial.println("\nWiFi Berhasil Terhubung!");
  WiFi.setSleep(false);

  configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("Menyesuaikan waktu dengan satelit NTP...");
  struct tm informasiWaktu;
  while (!getLocalTime(&informasiWaktu)) {
    Serial.print(".");
    delay(500);
  }
  Serial.println(" Tersinkronisasi!");
  
  char teksTampilanJam[30];
  strftime(teksTampilanJam, sizeof(teksTampilanJam), "%Y-%m-%d %H:%M:%S", &informasiWaktu);
  Serial.print("Waktu Wilayah Indonesia Barat (WIB): ");
  Serial.println(teksTampilanJam);

  configFirebase.api_key = API_KEY;
  configFirebase.database_url = DATABASE_URL;
  if (Firebase.signUp(&configFirebase, &authFirebase, "", "")) {
    Serial.println("Server Firebase Siap Digunakan!");
    statusKoneksiFirebase = true;
  } else {
    Serial.println(configFirebase.signer.signupError.message.c_str());
  }
  
  Firebase.begin(&configFirebase, &authFirebase);
  Firebase.reconnectWiFi(true);

  pinMode(LED_Biru, OUTPUT);
  pinMode(LED_Kuning, OUTPUT);
  pinMode(LED_Merah, OUTPUT);

  sensorSuhu.requestTemperatures();
}

void loop() {
  Firebase.ready();
  unsigned long waktuSekarang = millis();

  if (waktuSekarang - waktuSamplingTerakhir >= intervalSampling) {
    waktuSamplingTerakhir = waktuSekarang;

    bacaSemuaSensor();
    hitungNilaiSemuaSensor();

    totalSuhuSatuMenit += nilaiSuhu;
    totalPHSatuMenit += nilaiPH;
    totalTDSSatuMenit += nilaiTDS;
    totalKekeruhanSatuMenit += nilaiKekeruhan;
    jumlahSampelSatuMenit++;
  }

  if (waktuSekarang - waktuKirimRealtimeTerakhir >= intervalKirimRealtime) {
    waktuKirimRealtimeTerakhir = waktuSekarang;

    if (jumlahSampelSatuMenit > 0) {
      
      float rataRataPH = totalPHSatuMenit / jumlahSampelSatuMenit;
      float rataRataTDS = totalTDSSatuMenit / jumlahSampelSatuMenit;
      float rataRataKekeruhan = totalKekeruhanSatuMenit / jumlahSampelSatuMenit;
      float rataRataSuhu = totalSuhuSatuMenit / jumlahSampelSatuMenit;

      int skorWQI = hitungWQI(rataRataPH, rataRataTDS, rataRataKekeruhan, rataRataSuhu);
      bool terdapatNilaiBerbahaya = validasiDataSensor(rataRataPH, rataRataTDS, rataRataKekeruhan, rataRataSuhu);
      String kategoriWQI = tentukanKategoriWQI(skorWQI, terdapatNilaiBerbahaya);

      perbaruiLED(skorWQI);
      
      cetakDataSerial(rataRataPH, rataRataTDS, rataRataKekeruhan, rataRataSuhu, skorWQI, kategoriWQI);
      
      kirimRealtimeFirebase(rataRataPH, rataRataTDS, rataRataKekeruhan, rataRataSuhu, skorWQI, kategoriWQI);
      
      delay(50);
      periksaDanKirimPeringatanSistem(rataRataPH, rataRataTDS, rataRataKekeruhan, rataRataSuhu, skorWQI, kategoriWQI, waktuSekarang);

      totalSuhuSatuJam += rataRataSuhu;
      totalPHSatuJam += rataRataPH;
      totalTDSSatuJam += rataRataTDS;
      totalKekeruhanSatuJam += rataRataKekeruhan;
      jumlahSampelSatuJam++;

      totalSuhuSatuMenit = 0;
      totalPHSatuMenit = 0;
      totalTDSSatuMenit = 0;
      totalKekeruhanSatuMenit = 0;
      jumlahSampelSatuMenit = 0;
    }
  }

  kirimHistoryFirebase();
}
