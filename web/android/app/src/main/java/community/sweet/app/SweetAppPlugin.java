package community.sweet.app;

import android.app.Activity;
import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Arrays;
import java.util.List;
import org.json.JSONObject;

/**
 * The SweetApp plugin, which web/src/storeapp/native.ts calls. It holds the community the app shows, as its address,
 * or null for the app's own page with the list of communities. Switching restarts the activity, so the web view only
 * ever treats one community as its own.
 */
@CapacitorPlugin(name = "SweetApp")
public class SweetAppPlugin extends Plugin {

    /** Hosts that are this computer, as seen from the emulator. Only they may use plain http. */
    private static final List<String> LOCAL = Arrays.asList("localhost", "127.0.0.1", "10.0.2.2");

    private static boolean started = false;
    private static String open = null;
    private static String failed = null;

    /**
     * The community to show. At start it is the community opened last, which the app's own page stores with the
     * Preferences plugin as sweet.lastCommunity in the CapacitorStorage preferences.
     */
    static String openCommunity(Context context) {
        if (!started) {
            open = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE).getString("sweet.lastCommunity", null);
            started = true;
        }
        return open;
    }

    /** Shows the app's own page in place of a community that could not be loaded. */
    static void showListAfterFailure(Activity activity, String url) {
        failed = url;
        open = null;
        new Handler(Looper.getMainLooper()).post(activity::recreate);
    }

    /** Opens a community. Only an https address, or http on this computer for development, is accepted. */
    @PluginMethod
    public void open(PluginCall call) {
        String address = call.getString("url");
        Uri uri = address == null ? null : Uri.parse(address);
        boolean ok =
            uri != null && ("https".equals(uri.getScheme()) || ("http".equals(uri.getScheme()) && LOCAL.contains(uri.getHost())));
        if (!ok) {
            call.reject("The address must start with https://");
            return;
        }
        call.resolve();
        restart(address);
    }

    @PluginMethod
    public void showList(PluginCall call) {
        call.resolve();
        restart(null);
    }

    /** The community that could not be loaded, when the app's own page is shown in its place. */
    @PluginMethod
    public void unreachable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("url", failed == null ? JSONObject.NULL : failed);
        call.resolve(result);
    }

    /**
     * Signs this device out of a community by expiring the web view's cookies for its address. Sweet's cookies belong
     * to the host alone, so cookies of other sites and other communities are kept.
     */
    @PluginMethod
    public void forget(PluginCall call) {
        String address = call.getString("url");
        if (address == null) {
            call.reject("No address");
            return;
        }
        CookieManager cookies = CookieManager.getInstance();
        String current = cookies.getCookie(address);
        if (current != null) {
            for (String pair : current.split(";")) {
                String name = pair.split("=", 2)[0].trim();
                if (!name.isEmpty()) {
                    cookies.setCookie(address, name + "=; Max-Age=0; Path=/");
                }
            }
        }
        cookies.flush();
        call.resolve();
    }

    private void restart(String address) {
        Activity activity = getActivity();
        new Handler(Looper.getMainLooper()).post(() -> {
            started = true;
            open = address;
            failed = null;
            activity.recreate();
        });
    }
}
