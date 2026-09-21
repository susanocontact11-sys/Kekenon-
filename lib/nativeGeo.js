import { Capacitor, registerPlugin } from '@capacitor/core';

export function isNative() {
  return Capacitor.isNativePlatform();
}

export async function startGeo(onPosition, onError) {
  if (!isNative()) {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => onPosition({ coords: pos.coords, timestamp: pos.timestamp }),
      onError,
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 6000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }

  const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

  let watcherId;
  try {
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: 'Kèkè suit ta course en cours.',
        backgroundTitle: 'Course active',
        requestPermissions: true,
        stale: false,
        distanceFilter: 5
      },
      (location, error) => {
        if (error) { onError(error); return; }
        onPosition({
          coords: {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy
          },
          timestamp: location.time
        });
      }
    );
  } catch (e) {
    onError(e);
  }

  return () => { if (watcherId) BackgroundGeolocation.removeWatcher({ id: watcherId }); };
}
